import json

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST


def csrf_failure(request, reason=""):
    return JsonResponse(
        {"error": "Your session security token expired. Refresh the page and try again."},
        status=403,
    )


@require_GET
@ensure_csrf_cookie
def session(request):
    user = request.user
    return JsonResponse(
        {
            "user": {
                "id": user.pk,
                "username": user.username,
                "name": user.get_full_name() or user.username,
            }
            if user.is_authenticated
            else None
        }
    )


@require_POST
def sign_in(request):
    try:
        data = json.loads(request.body)
        username, password = data.get("username", ""), data.get("password", "")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or len(username) > 150
            or len(password) > 1024
        ):
            raise ValueError
    except (ValueError, AttributeError, UnicodeDecodeError):
        return JsonResponse({"error": "Enter a valid username and password."}, status=400)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"error": "The username or password is incorrect."}, status=401)
    login(request, user)
    return JsonResponse(
        {
            "user": {
                "id": user.pk,
                "username": user.username,
                "name": user.get_full_name() or user.username,
            }
        }
    )


@require_POST
def sign_out(request):
    logout(request)
    return JsonResponse({"ok": True})
