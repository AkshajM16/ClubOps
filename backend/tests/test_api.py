import json
from unittest.mock import patch

import pytest
from django.test import Client
from requests_app.models import Status

pytestmark = pytest.mark.django_db


def gql(client, query, variables=None):
    return client.post(
        "/graphql/",
        data=json.dumps({"query": query, "variables": variables or {}}),
        content_type="application/json",
    ).json()


def test_session_csrf_login_logout(world):
    client = Client(enforce_csrf_checks=True)
    assert client.get("/api/session/").json() == {"user": None}
    assert (
        client.post(
            "/api/login/",
            {"username": "member", "password": "test-password"},
            content_type="application/json",
        ).status_code
        == 403
    )
    token = client.cookies["csrftoken"].value
    bad = client.post(
        "/api/login/",
        {"username": "member", "password": "wrong"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert bad.status_code == 401
    result = client.post(
        "/api/login/",
        {"username": "member", "password": "test-password"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert result.status_code == 200
    assert result.json()["user"]["username"] == "member"
    assert client.get("/api/session/").json()["user"]["id"] == world.member.pk
    token = client.cookies["csrftoken"].value  # Django rotates CSRF on login.
    query = {"query": "{ me { username } }"}
    assert client.post("/graphql/", query, content_type="application/json").status_code == 403
    assert (
        client.post(
            "/graphql/", query, content_type="application/json", HTTP_X_CSRFTOKEN=token
        ).json()["data"]["me"]["username"]
        == "member"
    )
    assert client.post("/api/logout/", HTTP_X_CSRFTOKEN=token).status_code == 200
    assert client.get("/api/session/").json()["user"] is None


def test_anonymous_and_membership_queries(world, client):
    assert gql(client, "{ me { id } }")["data"]["me"] is None
    assert (
        gql(client, "{ organizations { id } }")["errors"][0]["extensions"]["code"]
        == "UNAUTHENTICATED"
    )
    client.force_login(world.member)
    result = gql(
        client,
        "{ organizations { id name myRole budget { total approved remaining pending } members { user { username } role } } }",
    )
    assert "errors" not in result
    assert [org["id"] for org in result["data"]["organizations"]] == [world.org.pk]
    assert result["data"]["organizations"][0]["myRole"] == "MEMBER"
    assert result["data"]["organizations"][0]["budget"]["remaining"] == "1000.00"
    hidden = gql(
        client,
        "query($id: Int!) { organization(organizationId: $id) { members { user { username } } budget { total } } }",
        {"id": world.other.pk},
    )
    assert hidden["errors"][0]["extensions"]["code"] == "NOT_FOUND"


def test_api_vertical_slice_filter_and_history(world, client):
    client.force_login(world.member)
    result = gql(
        client,
        """mutation($input: CreateRequestInput!) {
      createRequest(input: $input) { id amount status requiredRole canReview canCancel history { actor { username } toStatus } }
    }""",
        {
            "input": {
                "organizationId": world.org.pk,
                "title": "Team dinner",
                "description": "A team event",
                "amount": "50.25",
                "category": "EVENTS",
                "requestType": "PURCHASE",
            }
        },
    )
    assert "errors" not in result
    request = result["data"]["createRequest"]
    assert request["canCancel"] is True and request["canReview"] is False
    assert request["history"][0]["actor"]["username"] == "member"
    client.force_login(world.treasurer)
    approved = gql(
        client,
        "mutation($id: Int!) { approveRequest(requestId: $id) { id status history { toStatus } } }",
        {"id": request["id"]},
    )
    assert approved["data"]["approveRequest"]["status"] == "APPROVED"
    assert len(approved["data"]["approveRequest"]["history"]) == 2
    pending = gql(
        client,
        "query($org: Int!) { requests(organizationId: $org, status: PENDING) { id } }",
        {"org": world.org.pk},
    )
    assert pending["data"]["requests"] == []
    budget = gql(
        client,
        "query($id: Int!) { organization(organizationId: $id) { budget { approved remaining pending } } }",
        {"id": world.org.pk},
    )
    assert budget["data"]["organization"]["budget"] == {
        "approved": "50.25",
        "remaining": "949.75",
        "pending": "0.00",
    }


@pytest.mark.parametrize("operation", ["approveRequest", "rejectRequest", "cancelRequest"])
def test_cross_org_detail_and_mutations(world, make_request, client, operation):
    request = make_request()
    client.force_login(world.outsider)
    assert (
        gql(
            client,
            "query($id: Int!) { request(requestId: $id) { title history { actor { username } } } }",
            {"id": request.pk},
        )["errors"][0]["extensions"]["code"]
        == "NOT_FOUND"
    )
    result = gql(
        client,
        f"mutation($id: Int!) {{ {operation}(requestId: $id) {{ id }} }}",
        {"id": request.pk},
    )
    assert result["errors"][0]["extensions"]["code"] == "NOT_FOUND"
    request.refresh_from_db()
    assert request.status == Status.PENDING


def test_inbox_filters_by_captured_role(world, make_request, client):
    low = make_request("100.00")
    high = make_request("500.00")
    query = "query($id: Int!) { requests(organizationId: $id, inboxOnly: true) { id canReview } }"
    for actor, ids in [
        (world.member, []),
        (world.treasurer, [low.pk]),
        (world.admin, [high.pk, low.pk]),
    ]:
        client.force_login(actor)
        result = gql(client, query, {"id": world.org.pk})["data"]["requests"]
        assert [r["id"] for r in result] == ids
        assert all(r["canReview"] for r in result)


def test_safe_unexpected_errors(world, client):
    client.force_login(world.member)
    with patch(
        "core.schema.services.membership",
        side_effect=RuntimeError("private database password"),
    ):
        result = gql(
            client,
            "query($id: Int!) { organization(organizationId: $id) { id } }",
            {"id": world.org.pk},
        )
    assert result["errors"][0]["message"] == "Unexpected error."
    assert "private database password" not in json.dumps(result)


def test_pagination_validation(world, client):
    client.force_login(world.member)
    for args in ["limit: 101", "offset: -1", "limit: 0"]:
        result = gql(client, f"{{ requests(organizationId: {world.org.pk}, {args}) {{ id }} }}")
        assert result["errors"][0]["extensions"]["code"] == "INVALID_INPUT"


def test_policy_mutation_authorization(world, client):
    query = 'mutation($id: Int!) { updateApprovalThreshold(organizationId: $id, threshold: "900.00") { approvalThreshold } }'
    client.force_login(world.treasurer)
    assert (
        gql(client, query, {"id": world.org.pk})["errors"][0]["extensions"]["code"] == "FORBIDDEN"
    )
    client.force_login(world.admin)
    assert (
        gql(client, query, {"id": world.org.pk})["data"]["updateApprovalThreshold"][
            "approvalThreshold"
        ]
        == "900.00"
    )
