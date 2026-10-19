import os
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from organizations.models import Membership, Organization, Role

from requests_app.models import SpendingRequest, Status
from requests_app.services import create_request, transition


class Command(BaseCommand):
    help = "Seed development-only accounts and example data, safely rerunnable."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo seeding is only enabled with DJANGO_DEBUG=true.")
        password = os.getenv("DEMO_PASSWORD", "ClubOps-demo-2026!")
        accounts = {}
        for username, first, last in [
            ("member", "Alex", "Morgan"),
            ("treasurer", "Jordan", "Lee"),
            ("admin", "Sam", "Rivera"),
            ("outsider", "Taylor", "Chen"),
        ]:
            account, created = get_user_model().objects.get_or_create(
                username=username, defaults={"first_name": first, "last_name": last}
            )
            if created:
                account.set_password(password)
                account.save()
            accounts[username] = account
        robotics, _ = Organization.objects.get_or_create(
            name="Robotics Society",
            defaults={
                "total_budget": Decimal("12000"),
                "approval_threshold": Decimal("500"),
            },
        )
        outdoors, _ = Organization.objects.get_or_create(
            name="Outdoor Collective",
            defaults={
                "total_budget": Decimal("6500"),
                "approval_threshold": Decimal("300"),
            },
        )
        for name, role in [
            ("member", Role.MEMBER),
            ("treasurer", Role.TREASURER),
            ("admin", Role.ADMIN),
        ]:
            Membership.objects.get_or_create(
                organization=robotics, user=accounts[name], defaults={"role": role}
            )
        for name, role in [("admin", Role.ADMIN), ("outsider", Role.MEMBER)]:
            Membership.objects.get_or_create(
                organization=outdoors, user=accounts[name], defaults={"role": role}
            )
        examples = [
            (
                robotics,
                "Regional competition registration",
                "Entry fees for our six-person competition team.",
                "1200.00",
                "EVENTS",
                "APPROVED",
            ),
            (
                robotics,
                "Workshop electronics kits",
                "Reusable breadboards and sensors for the first-year workshop.",
                "285.00",
                "SUPPLIES",
                "PENDING",
            ),
            (
                robotics,
                "3D printer maintenance",
                "Replacement nozzle assembly and service for the lab printer.",
                "640.00",
                "EQUIPMENT",
                "PENDING",
            ),
            (
                robotics,
                "Team travel reimbursement",
                "Train tickets for the regional engineering meetup.",
                "178.50",
                "TRAVEL",
                "APPROVED",
            ),
            (
                robotics,
                "Welcome night catering",
                "Dinner for the fall semester welcome event.",
                "350.00",
                "EVENTS",
                "REJECTED",
            ),
            (
                robotics,
                "Spare motor order",
                "Duplicate parts order, withdrawn after inventory review.",
                "95.00",
                "EQUIPMENT",
                "CANCELLED",
            ),
            (
                outdoors,
                "Trail restoration supplies",
                "Gloves, bags, and hand tools for the volunteer trail day.",
                "225.00",
                "SUPPLIES",
                "PENDING",
            ),
            (
                outdoors,
                "Camping equipment",
                "Shared tents and sleeping mats for weekend trips.",
                "850.00",
                "EQUIPMENT",
                "APPROVED",
            ),
        ]
        for org, title, description, amount, category, status in examples:
            if SpendingRequest.objects.filter(organization=org, title=title).exists():
                continue
            submitter = accounts["member"] if org == robotics else accounts["outsider"]
            req = create_request(
                submitter,
                org.pk,
                title,
                description,
                Decimal(amount),
                category,
                "REIMBURSEMENT" if "reimbursement" in title else "PURCHASE",
            )
            if status != Status.PENDING:
                actor = submitter if status == Status.CANCELLED else accounts["admin"]
                transition(actor, req.pk, status)
        self.stdout.write(
            self.style.SUCCESS(
                "Demo ready: member, treasurer, admin, outsider. Existing accounts and requests were preserved."
            )
        )
