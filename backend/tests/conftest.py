from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from organizations.models import Membership, Organization, Role
from requests_app.services import create_request


@pytest.fixture
def world(db):
    users = {}
    for username in ["member", "treasurer", "admin", "outsider"]:
        users[username] = get_user_model().objects.create_user(
            username=username, password="test-password"
        )
    org = Organization.objects.create(
        name="Robotics",
        total_budget=Decimal("1000.00"),
        approval_threshold=Decimal("500.00"),
    )
    other = Organization.objects.create(
        name="Outdoor",
        total_budget=Decimal("2000.00"),
        approval_threshold=Decimal("300.00"),
    )
    for name, role in [
        ("member", Role.MEMBER),
        ("treasurer", Role.TREASURER),
        ("admin", Role.ADMIN),
    ]:
        Membership.objects.create(user=users[name], organization=org, role=role)
    Membership.objects.create(user=users["outsider"], organization=other, role=Role.ADMIN)
    return SimpleNamespace(org=org, other=other, **users)


@pytest.fixture
def make_request(world):
    def make(amount="100.00", **kwargs):
        fields = dict(
            user=world.member,
            organization_id=world.org.pk,
            title="Workshop supplies",
            description="Parts for the next student workshop.",
            amount=Decimal(amount),
            category="SUPPLIES",
            request_type="PURCHASE",
        )
        fields.update(kwargs)
        return create_request(**fields)

    return make
