from decimal import Decimal

import pytest
from core.errors import DomainError
from django.contrib.auth.models import AnonymousUser
from django.core.management import call_command
from django.db import IntegrityError, transaction
from organizations.models import Organization, Role
from requests_app.models import AuditEvent, SpendingRequest, Status
from requests_app.services import (
    request_for_user,
    transition,
    update_threshold,
)

pytestmark = pytest.mark.django_db


def test_creation_and_audit(world, make_request):
    request = make_request("12.34", title="  Team supplies  ")
    assert request.title == "Team supplies"
    assert request.status == Status.PENDING
    assert request.amount == Decimal("12.34")
    assert request.required_role == Role.TREASURER
    event = request.history.get()
    assert event.actor_id == world.member.pk
    assert (event.from_status, event.to_status) == ("", Status.PENDING)
    assert request.created_at and event.created_at
    world.org.refresh_from_db()
    assert world.org.approved_spending == 0


@pytest.mark.parametrize("amount", ["0", "-1", "1.001", "NaN", "Infinity", "10000000000", "0.009"])
def test_invalid_money(make_request, amount):
    with pytest.raises(DomainError, match="positive amount"):
        make_request(amount)
    assert SpendingRequest.objects.count() == 0
    assert AuditEvent.objects.count() == 0


@pytest.mark.parametrize(
    "fields",
    [
        {"title": "  "},
        {"title": "x" * 161},
        {"description": ""},
        {"description": "x" * 4001},
        {"category": "BAD"},
        {"request_type": "BAD"},
    ],
)
def test_invalid_input(make_request, fields):
    with pytest.raises(DomainError):
        make_request(**fields)


@pytest.mark.parametrize(
    "amount,role",
    [("499.99", Role.TREASURER), ("500.00", Role.ADMIN), ("500.01", Role.ADMIN)],
)
def test_threshold_boundary_and_snapshot(world, make_request, amount, role):
    request = make_request(amount)
    assert request.required_role == role
    update_threshold(world.admin, world.org.pk, Decimal("100.00"))
    request.refresh_from_db()
    assert request.required_role == role
    assert make_request("100.00").required_role == Role.ADMIN


@pytest.mark.parametrize("action", [Status.APPROVED, Status.REJECTED])
def test_member_cannot_review(world, make_request, action):
    request = make_request()
    with pytest.raises(DomainError) as error:
        transition(world.member, request.pk, action)
    assert error.value.code == "FORBIDDEN"
    assert request.history.count() == 1


@pytest.mark.parametrize("action", [Status.APPROVED, Status.REJECTED])
def test_treasurer_cannot_review_admin_request(world, make_request, action):
    request = make_request("500.00")
    with pytest.raises(DomainError):
        transition(world.treasurer, request.pk, action)


@pytest.mark.parametrize(
    "actor,amount", [("treasurer", "499.99"), ("admin", "499.99"), ("admin", "500.00")]
)
def test_authorized_approval(world, make_request, actor, amount):
    request = make_request(amount)
    result = transition(getattr(world, actor), request.pk, Status.APPROVED)
    world.org.refresh_from_db()
    assert result.status == Status.APPROVED
    assert world.org.approved_spending == Decimal(amount)
    event = request.history.get(to_status=Status.APPROVED)
    assert event.actor == getattr(world, actor)
    assert event.from_status == Status.PENDING


def test_duplicate_approval_is_retry_safe_but_still_authorized(world, make_request):
    request = make_request()
    transition(world.treasurer, request.pk, Status.APPROVED)
    transition(world.admin, request.pk, Status.APPROVED)
    world.org.refresh_from_db()
    assert world.org.approved_spending == Decimal("100.00")
    assert request.history.count() == 2
    assert request.history.get(to_status=Status.APPROVED).actor == world.treasurer
    with pytest.raises(DomainError):
        transition(world.member, request.pk, Status.APPROVED)


@pytest.mark.parametrize("terminal", [Status.APPROVED, Status.REJECTED, Status.CANCELLED])
def test_terminal_transitions(world, make_request, terminal):
    request = make_request()
    actor = world.member if terminal == Status.CANCELLED else world.admin
    transition(actor, request.pk, terminal)
    transition(actor, request.pk, terminal)
    assert request.history.count() == 2
    for action in {Status.APPROVED, Status.REJECTED, Status.CANCELLED} - {terminal}:
        reviewer = world.member if action == Status.CANCELLED else world.admin
        with pytest.raises(DomainError) as error:
            transition(reviewer, request.pk, action)
        assert error.value.code == "INVALID_TRANSITION"
    world.org.refresh_from_db()
    assert world.org.approved_spending == (Decimal("100") if terminal == Status.APPROVED else 0)


def test_only_submitter_can_cancel(world, make_request):
    request = make_request()
    with pytest.raises(DomainError, match="own requests"):
        transition(world.admin, request.pk, Status.CANCELLED)
    transition(world.member, request.pk, Status.CANCELLED)


def test_budget_exhaustion_and_exact_remaining(world, make_request):
    first = make_request("1000.00")
    second = make_request("0.01")
    transition(world.admin, first.pk, Status.APPROVED)
    with pytest.raises(DomainError) as error:
        transition(world.admin, second.pk, Status.APPROVED)
    assert error.value.code == "INSUFFICIENT_BUDGET"
    second.refresh_from_db()
    world.org.refresh_from_db()
    assert second.status == Status.PENDING
    assert second.history.count() == 1
    assert world.org.approved_spending == world.org.total_budget


def test_cross_org_isolation_and_anonymous(world, make_request):
    request = make_request()
    for actor in [world.outsider, AnonymousUser()]:
        for operation in [
            lambda: request_for_user(actor, request.pk),
            lambda: transition(actor, request.pk, Status.APPROVED),
            lambda: update_threshold(actor, world.org.pk, Decimal("5")),
            lambda: make_request(user=actor),
        ]:
            with pytest.raises(DomainError):
                operation()
    assert SpendingRequest.objects.count() == 1


@pytest.mark.parametrize("actor", ["member", "treasurer"])
def test_only_admin_changes_policy(world, actor):
    with pytest.raises(DomainError):
        update_threshold(getattr(world, actor), world.org.pk, Decimal("700"))


@pytest.mark.parametrize("amount", ["0", "-3", "1.001"])
def test_policy_validation(world, amount):
    with pytest.raises(DomainError):
        update_threshold(world.admin, world.org.pk, Decimal(amount))


def test_transaction_rolls_back_budget_and_state_if_audit_fails(world, make_request, monkeypatch):
    request = make_request()

    def fail(**kwargs):
        raise RuntimeError("injected failure")

    monkeypatch.setattr(AuditEvent.objects, "create", fail)
    with pytest.raises(RuntimeError):
        transition(world.admin, request.pk, Status.APPROVED)
    request.refresh_from_db()
    world.org.refresh_from_db()
    assert request.status == Status.PENDING
    assert world.org.approved_spending == 0


def test_database_rejects_overspending_and_duplicate_event(world, make_request):
    request = make_request()
    with pytest.raises(IntegrityError), transaction.atomic():
        Organization.objects.filter(pk=world.org.pk).update(approved_spending=Decimal("1000.01"))
    with pytest.raises(IntegrityError), transaction.atomic():
        AuditEvent.objects.create(
            request=request,
            actor=world.member,
            from_status="",
            to_status=Status.PENDING,
        )


def test_seed_is_rerunnable(settings):
    settings.DEBUG = True
    call_command("seed_demo")
    counts = (
        Organization.objects.count(),
        SpendingRequest.objects.count(),
        AuditEvent.objects.count(),
    )
    budgets = list(Organization.objects.values_list("approved_spending", flat=True))
    call_command("seed_demo")
    assert counts == (
        Organization.objects.count(),
        SpendingRequest.objects.count(),
        AuditEvent.objects.count(),
    )
    assert budgets == list(Organization.objects.values_list("approved_spending", flat=True))
