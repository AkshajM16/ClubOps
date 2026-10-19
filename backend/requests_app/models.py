from django.conf import settings
from django.db import models
from django.db.models import Q
from organizations.models import Organization, Role


class Status(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class Category(models.TextChoices):
    EVENTS = "EVENTS", "Events"
    EQUIPMENT = "EQUIPMENT", "Equipment"
    TRAVEL = "TRAVEL", "Travel"
    SUPPLIES = "SUPPLIES", "Supplies"
    OTHER = "OTHER", "Other"


class RequestType(models.TextChoices):
    PURCHASE = "PURCHASE", "Purchase"
    REIMBURSEMENT = "REIMBURSEMENT", "Reimbursement"


class SpendingRequest(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.PROTECT, related_name="spending_requests"
    )
    submitter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    title = models.CharField(max_length=160)
    description = models.TextField(max_length=4000)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=12, choices=Category.choices)
    request_type = models.CharField(max_length=15, choices=RequestType.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    required_role = models.CharField(
        max_length=10, choices=[(Role.TREASURER, "Treasurer"), (Role.ADMIN, "Admin")]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        indexes = [models.Index(fields=["organization", "status", "-created_at"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="request_amount_positive"),
            models.CheckConstraint(
                condition=Q(status__in=Status.values), name="valid_request_status"
            ),
            models.CheckConstraint(
                condition=Q(required_role__in=[Role.TREASURER, Role.ADMIN]),
                name="valid_required_role",
            ),
            models.CheckConstraint(
                condition=Q(category__in=Category.values), name="valid_category"
            ),
            models.CheckConstraint(
                condition=Q(request_type__in=RequestType.values),
                name="valid_request_type",
            ),
        ]


class AuditEvent(models.Model):
    request = models.ForeignKey(SpendingRequest, on_delete=models.PROTECT, related_name="history")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    from_status = models.CharField(max_length=10, blank=True)
    to_status = models.CharField(max_length=10, choices=Status.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "to_status"], name="unique_request_state_event"
            ),
            models.CheckConstraint(
                condition=(
                    Q(from_status="", to_status=Status.PENDING)
                    | Q(
                        from_status=Status.PENDING,
                        to_status__in=[
                            Status.APPROVED,
                            Status.REJECTED,
                            Status.CANCELLED,
                        ],
                    )
                ),
                name="valid_audit_transition",
            ),
        ]
