from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Callable, TypeVar
import strawberry
from django.db.models import Sum
from graphql import GraphQLError
from strawberry.extensions import MaskErrors
from strawberry.extensions import QueryDepthLimiter
from strawberry.types import Info
from core.errors import DomainError
from organizations.models import Membership, Organization, Role
from requests_app import services
from requests_app.models import AuditEvent, SpendingRequest, Status, Category, RequestType

RoleEnum = strawberry.enum(Enum('Role', {v: v for v in Role.values}))
StatusEnum = strawberry.enum(Enum('RequestStatus', {v: v for v in Status.values}))
CategoryEnum = strawberry.enum(Enum('Category', {v: v for v in Category.values}))
RequestTypeEnum = strawberry.enum(Enum('RequestType', {v: v for v in RequestType.values}))
T = TypeVar('T')


def call(function: Callable[[], T]) -> T:
    try:
        return function()
    except DomainError as exc:
        raise GraphQLError(str(exc), extensions={'code': exc.code}) from exc


def user(info: Info):
    return call(lambda: services.authenticated(info.context.request.user))


@strawberry.type
class UserNode:
    id: int
    username: str
    name: str

    @classmethod
    def from_model(cls, obj):
        return cls(id=obj.pk, username=obj.username, name=obj.get_full_name() or obj.username)


@strawberry.type
class MemberNode:
    user: UserNode
    role: RoleEnum


@strawberry.type
class BudgetNode:
    total: Decimal
    approved: Decimal
    remaining: Decimal
    pending: Decimal


@strawberry.type
class OrganizationNode:
    id: int
    name: str
    approval_threshold: Decimal
    my_role: RoleEnum

    @classmethod
    def from_model(cls, obj, role):
        return cls(id=obj.pk, name=obj.name, approval_threshold=obj.approval_threshold, my_role=RoleEnum(role))

    @strawberry.field
    def budget(self, info: Info) -> BudgetNode:
        # Refresh authorized organization on every field access.
        org = call(lambda: services.membership(user(info), self.id)).organization
        pending = org.spending_requests.filter(status=Status.PENDING).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return BudgetNode(total=org.total_budget, approved=org.approved_spending,
                          remaining=org.total_budget-org.approved_spending, pending=pending)

    @strawberry.field
    def members(self, info: Info) -> list[MemberNode]:
        call(lambda: services.membership(user(info), self.id))
        return [MemberNode(user=UserNode.from_model(m.user), role=RoleEnum(m.role))
                for m in Membership.objects.filter(organization_id=self.id).select_related('user').order_by('user__username')]


@strawberry.type
class AuditNode:
    id: int
    actor: UserNode
    from_status: str
    to_status: StatusEnum
    created_at: datetime

    @classmethod
    def from_model(cls, obj: AuditEvent):
        return cls(id=obj.pk, actor=UserNode.from_model(obj.actor), from_status=obj.from_status,
                   to_status=StatusEnum(obj.to_status), created_at=obj.created_at)


@strawberry.type
class RequestNode:
    id: int
    organization_id: int
    title: str
    description: str
    amount: Decimal
    category: CategoryEnum
    request_type: RequestTypeEnum
    status: StatusEnum
    required_role: RoleEnum
    submitter: UserNode
    created_at: datetime
    can_review: bool
    can_cancel: bool

    @classmethod
    def from_model(cls, obj: SpendingRequest, viewer, role: str):
        return cls(id=obj.pk, organization_id=obj.organization_id, title=obj.title,
                   description=obj.description, amount=obj.amount, category=CategoryEnum(obj.category),
                   request_type=RequestTypeEnum(obj.request_type), status=StatusEnum(obj.status),
                   required_role=RoleEnum(obj.required_role), submitter=UserNode.from_model(obj.submitter),
                   created_at=obj.created_at,
                   can_review=obj.status == Status.PENDING and services.can_review(role, obj.required_role),
                   can_cancel=obj.status == Status.PENDING and obj.submitter_id == viewer.pk)

    @strawberry.field
    def history(self, info: Info) -> list[AuditNode]:
        obj = call(lambda: services.request_for_user(user(info), self.id))
        return [AuditNode.from_model(event) for event in obj.history.select_related('actor').all()]


def request_node(obj, viewer):
    role = call(lambda: services.membership(viewer, obj.organization_id)).role
    return RequestNode.from_model(obj, viewer, role)


@strawberry.type
class Query:
    @strawberry.field
    def me(self, info: Info) -> UserNode | None:
        viewer = info.context.request.user
        return UserNode.from_model(viewer) if viewer.is_authenticated else None

    @strawberry.field
    def organizations(self, info: Info) -> list[OrganizationNode]:
        viewer = user(info)
        return [OrganizationNode.from_model(m.organization, m.role)
                for m in Membership.objects.filter(user=viewer).select_related('organization').order_by('organization__name')]

    @strawberry.field
    def organization(self, info: Info, organization_id: int) -> OrganizationNode:
        member = call(lambda: services.membership(user(info), organization_id))
        return OrganizationNode.from_model(member.organization, member.role)

    @strawberry.field
    def requests(self, info: Info, organization_id: int, status: StatusEnum | None = None,
                 inbox_only: bool = False, limit: int = 50, offset: int = 0) -> list[RequestNode]:
        viewer = user(info)
        member = call(lambda: services.membership(viewer, organization_id))
        if not 1 <= limit <= 100 or offset < 0:
            raise GraphQLError('Use a limit between 1 and 100 and a nonnegative offset.', extensions={'code': 'INVALID_INPUT'})
        rows = SpendingRequest.objects.filter(organization_id=organization_id).select_related('submitter')
        if status:
            rows = rows.filter(status=status.value)
        if inbox_only:
            rows = rows.filter(status=Status.PENDING)
            if member.role == Role.MEMBER:
                rows = rows.none()
            elif member.role == Role.TREASURER:
                rows = rows.filter(required_role=Role.TREASURER)
        return [RequestNode.from_model(obj, viewer, member.role) for obj in rows[offset:offset+limit]]

    @strawberry.field
    def request(self, info: Info, request_id: int) -> RequestNode:
        viewer = user(info)
        return request_node(call(lambda: services.request_for_user(viewer, request_id)), viewer)


@strawberry.input
class CreateRequestInput:
    organization_id: int
    title: str
    description: str
    amount: Decimal
    category: CategoryEnum
    request_type: RequestTypeEnum


@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_request(self, info: Info, input: CreateRequestInput) -> RequestNode:
        viewer = user(info)
        obj = call(lambda: services.create_request(viewer, input.organization_id, input.title, input.description,
                   input.amount, input.category.value, input.request_type.value))
        return request_node(obj, viewer)

    @strawberry.mutation
    def approve_request(self, info: Info, request_id: int) -> RequestNode:
        viewer = user(info)
        return request_node(call(lambda: services.transition(viewer, request_id, Status.APPROVED)), viewer)

    @strawberry.mutation
    def reject_request(self, info: Info, request_id: int) -> RequestNode:
        viewer = user(info)
        return request_node(call(lambda: services.transition(viewer, request_id, Status.REJECTED)), viewer)

    @strawberry.mutation
    def cancel_request(self, info: Info, request_id: int) -> RequestNode:
        viewer = user(info)
        return request_node(call(lambda: services.transition(viewer, request_id, Status.CANCELLED)), viewer)

    @strawberry.mutation
    def update_approval_threshold(self, info: Info, organization_id: int, threshold: Decimal) -> OrganizationNode:
        viewer = user(info)
        obj = call(lambda: services.update_threshold(viewer, organization_id, threshold))
        return OrganizationNode.from_model(obj, Role.ADMIN)


schema = strawberry.Schema(query=Query, mutation=Mutation, extensions=[
    QueryDepthLimiter(max_depth=8),
    MaskErrors(should_mask_error=lambda error: not isinstance(error.original_error, (DomainError, GraphQLError))),
])
