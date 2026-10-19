from accounts import views
from core.schema import schema
from django.conf import settings
from django.urls import path
from django.views.decorators.csrf import csrf_protect
from strawberry.django.views import GraphQLView

urlpatterns = [
    path("api/session/", views.session),
    path("api/login/", views.sign_in),
    path("api/logout/", views.sign_out),
    path(
        "graphql/",
        csrf_protect(
            GraphQLView.as_view(
                schema=schema,
                graphql_ide="graphiql" if settings.DEBUG else None,
                allow_queries_via_get=False,
            )
        ),
    ),
]
