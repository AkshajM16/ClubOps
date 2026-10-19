from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Role(models.TextChoices):
    MEMBER = "MEMBER", "Member"
    TREASURER = "TREASURER", "Treasurer"
    ADMIN = "ADMIN", "Admin"


class Organization(models.Model):
    name = models.CharField(max_length=120, unique=True)
    total_budget = models.DecimalField(max_digits=12, decimal_places=2)
    approved_spending = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    approval_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=500)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(total_budget__gte=0), name="budget_nonnegative"),
            models.CheckConstraint(
                condition=Q(approved_spending__gte=0) & Q(approved_spending__lte=F("total_budget")),
                name="spending_within_budget",
            ),
            models.CheckConstraint(
                condition=Q(approval_threshold__gt=0), name="threshold_positive"
            ),
        ]


class Membership(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=10, choices=Role.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "user"], name="unique_membership"),
            models.CheckConstraint(condition=Q(role__in=Role.values), name="valid_membership_role"),
        ]
