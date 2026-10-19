"""Real PostgreSQL sessions are forced to contend on an organization row lock."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Event

import pytest
from core.errors import DomainError
from django.db import connection, connections, transaction
from organizations.models import Organization
from requests_app.models import Status
from requests_app.services import transition

pytestmark = pytest.mark.django_db(transaction=True)


def compete(world, operations):
    assert connection.vendor == "postgresql", (
        "Concurrency tests require PostgreSQL; do not substitute SQLite."
    )
    started = [Event() for _ in operations]

    def worker(index, request_id, target):
        connections.close_all()

        def observe(execute, sql, params, many, context):
            if "FOR UPDATE" in sql and "organizations_organization" in sql:
                started[index].set()
            return execute(sql, params, many, context)

        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '8s'")
            with connection.execute_wrapper(observe):
                transition(world.admin, request_id, target)
            return target
        except DomainError as error:
            return error.code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        with transaction.atomic():
            # Hold the lock until both independent database sessions attempt to acquire it.
            Organization.objects.select_for_update().get(pk=world.org.pk)
            futures = [
                pool.submit(worker, i, pk, target) for i, (pk, target) in enumerate(operations)
            ]
            assert all(event.wait(timeout=5) for event in started)
        return [future.result(timeout=12) for future in futures]


def test_competing_approvals_cannot_overspend(world, make_request):
    first, second = make_request("600.00"), make_request("600.00")
    results = compete(world, [(first.pk, Status.APPROVED), (second.pk, Status.APPROVED)])
    assert sorted(results) == sorted([Status.APPROVED, "INSUFFICIENT_BUDGET"])
    world.org.refresh_from_db()
    assert world.org.approved_spending == Decimal("600.00")
    assert world.org.spending_requests.filter(status=Status.APPROVED).count() == 1
    assert world.org.spending_requests.filter(status=Status.PENDING).count() == 1
    assert sum(r.history.count() for r in [first, second]) == 3


def test_simultaneous_duplicate_approval_is_idempotent(world, make_request):
    request = make_request("400.00")
    assert compete(world, [(request.pk, Status.APPROVED), (request.pk, Status.APPROVED)]) == [
        Status.APPROVED,
        Status.APPROVED,
    ]
    world.org.refresh_from_db()
    assert world.org.approved_spending == Decimal("400.00")
    assert request.history.count() == 2


def test_conflicting_concurrent_actions_have_one_winner(world, make_request):
    request = make_request("400.00")
    results = compete(world, [(request.pk, Status.APPROVED), (request.pk, Status.REJECTED)])
    assert results.count("INVALID_TRANSITION") == 1
    request.refresh_from_db()
    world.org.refresh_from_db()
    assert request.status in [Status.APPROVED, Status.REJECTED]
    assert request.history.count() == 2
    assert world.org.approved_spending == (
        Decimal("400.00") if request.status == Status.APPROVED else 0
    )
