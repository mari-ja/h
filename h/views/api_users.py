# -*- coding: utf-8 -*-

from __future__ import unicode_literals

import base64
import hmac

from pyramid.view import view_config

from h.i18n import TranslationString as _
from h.models import AuthClient


class APIError(Exception):

    """Base exception for problems handling API requests."""

    def __init__(self, message, status_code=500):
        self.status_code = status_code
        super(APIError, self).__init__(message)


class ClientUnauthorized(APIError):

    """Exception raised if the client credentials provided were invalid."""

    def __init__(self):
        super(ClientUnauthorized, self).__init__(
            _('Client credentials are invalid'),
            status_code=401
        )


def api_config(**settings):
    """
    A view configuration decorator with defaults JSON input and output types.
    """
    settings.setdefault('accept', 'application/json')
    settings.setdefault('renderer', 'json')
    return view_config(**settings)


@api_config(context=APIError)
def error_api(context, request):
    request.response.status_code = context.status_code
    return {'status': 'failure', 'reason': context.message}


@api_config(route_name='api.users')
def create(request):
    client = _request_client(request)
    payload = request.json_body

    user_props = {
        'authority': client.authority,
        'username': payload['username'],
        'email': payload['email'],
    }

    user_signup_service = request.find_service(name='user_signup')
    user = user_signup_service.signup(require_activation=False, **user_props)

    return {
        'authority': user.authority,
        'email': user.email,
        'userid': user.userid,
        'username': user.username,
    }


def _request_client(request):
    creds = _extract_basic_auth_creds(request)
    if creds is None:
        raise ClientUnauthorized()

    client_id, client_secret = creds
    client = request.db.query(AuthClient).get(client_id)
    if client is None:
        raise ClientUnauthorized()

    if not hmac.compare_digest(client.secret, client_secret):
        raise ClientUnauthorized()

    return client


def _extract_basic_auth_creds(request):
    try:
        authtype, value = request.authorization
    except TypeError:  # no authorization header
        return None
    if authtype.lower() != 'basic':
        return None
    try:
        decoded = base64.standard_b64decode(value)
    except TypeError:  # failed to decode
        return None
    try:
        username, password = decoded.split(':', 1)
    except ValueError:  # not enough values to unpack
        return None
    return (username, password)


def includeme(config):
    config.scan(__name__)
