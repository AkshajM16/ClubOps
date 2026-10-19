"""All writes use organization → request lock order. Keep transactions short."""

from decimal import Decimal, InvalidOperation

from core.errors import DomainError
from django.db import transaction
from organizations.models import Membership, Organization, Role

from .models import AuditEvent, Category, RequestType, SpendingRequest, Status


def authenticated(user):
    if not user.is_authenticated:
        raise DomainError("Please sign in to continue.", "UNAUTHENTICATED")
    return user


def membership(user, organization_id: int) -> Membership:
    authenticated(user)
    result = (
        Membership.objects.select_related("organization", "user")
        .filter(user=user, organization_id=organization_id)
        .first()
    )
    if result is None:
        raise DomainError("Organization not found or access denied.", "NOT_FOUND")
    return result


def money(value: Decimal) -> Decimal:
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount <= 0 or amount > Decimal("9999999999.99"):
            raise ValueError
        if amount != amount.quantize(Decimal("0.01")):
            raise ValueError
        return amount.quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        raise DomainError(
            "Enter a positive amount with at most two decimal places (maximum 9,999,999,999.99)."
        ) from None


def request_for_user(user, request_id: int) -> SpendingRequest:
    authenticated(user)
    result = (
        SpendingRequest.objects.select_related("submitter", "organization")
        .filter(
            pk=request_id,
            organization__memberships__user=user,
        )
        .first()
    )
    if result is None:
        raise DomainError("Request not found or access denied.", "NOT_FOUND")
    return result


def can_review(role: str, required_role: str) -> bool:
    return role == Role.ADMIN or (role == Role.TREASURER and required_role == Role.TREASURER)


@transaction.atomic
def create_request(
    user,
    organization_id: int,
    title: str,
    description: str,
    amount: Decimal,
    category: str,
    request_type: str,
) -> SpendingRequest:
    membership(user, organization_id)
    title, description = title.strip(), description.strip()
    if not title or len(title) > 160 or not description or len(description) > 4000:
        raise DomainError(
            "Provide a title (1–160 characters) and description (1–4,000 characters)."
        )
    amount = money(amount)
    if category not in Category.values or request_type not in RequestType.values:
        raise DomainError("Choose a valid category and request type.")
    org = Organization.objects.select_for_update().get(pk=organization_id)
    result = SpendingRequest.objects.create(
        organization=org,
        submitter=user,
        title=title,
        description=description,
        amount=amount,
        category=category,
        request_type=request_type,
        required_role=Role.ADMIN if amount >= org.approval_threshold else Role.TREASURER,
    )
    AuditEvent.objects.create(request=result, actor=user, from_status="", to_status=Status.PENDING)
    return result


@transaction.atomic
def transition(user, request_id: int, target: str) -> SpendingRequest:
    # Resolve only through the user's memberships before locking. Organization is immutable.
    original = request_for_user(user, request_id)
    org = Organization.objects.select_for_update().get(pk=original.organization_id)
    request = SpendingRequest.objects.select_for_update().get(pk=request_id)
    role = membership(user, org.pk).role
    if target == Status.CANCELLED:
        if request.submitter_id != user.pk:
            raise DomainError("You can only cancel your own requests.", "FORBIDDEN")
    elif target in (Status.APPROVED, Status.REJECTED):
        if not can_review(role, request.required_role):
            raise DomainError(
                f"This request requires {request.required_role.lower()} approval.",
                "FORBIDDEN",
            )
    else:
        raise DomainError("Unsupported state transition.")
    # Authorization precedes idempotent success, including retries after a terminal state.
    if request.status == target:
        return request
    if request.status != Status.PENDING:
        raise DomainError(
            f"This request is already {request.status.lower()} and cannot be changed.",
            "INVALID_TRANSITION",
        )
    if target == Status.APPROVED:
        remaining = org.total_budget - org.approved_spending
        if request.amount > remaining:
            raise DomainError(
                f"Insufficient budget. ${remaining:,.2f} remains; this request needs ${request.amount:,.2f}.",
                "INSUFFICIENT_BUDGET",
            )
        org.approved_spending += request.amount
        org.save(update_fields=["approved_spending"])
    request.status = target
    request.save(update_fields=["status", "updated_at"])
    AuditEvent.objects.create(
        request=request, actor=user, from_status=Status.PENDING, to_status=target
    )
    return request


@transaction.atomic
def update_threshold(user, organization_id: int, threshold: Decimal) -> Organization:
    member = membership(user, organization_id)
    if member.role != Role.ADMIN:
        raise DomainError("Only admins can update the approval threshold.", "FORBIDDEN")
    threshold = money(threshold)
    org = Organization.objects.select_for_update().get(pk=organization_id)
    org.approval_threshold = threshold
    org.save(update_fields=["approval_threshold"])
    return org
