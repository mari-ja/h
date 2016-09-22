# -*- coding: utf-8 -*-

from __future__ import unicode_literals

import base64

import pytest
from mock import Mock

from h.accounts.services import UserSignupService
from h.views.api_users import ClientUnauthorized, create


@pytest.mark.usefixtures('user_signup_service')
class TestCreate(object):

    def test_returns_user_object(self,
                                 auth_client,
                                 factories,
                                 pyramid_request,
                                 user_signup_service,
                                 valid_user):
        pyramid_request.authorization = _basic_auth(auth_client.id,
                                                    auth_client.secret)
        pyramid_request.json_body = valid_user
        user_signup_service.signup.return_value = factories.User(**valid_user)

        result = create(pyramid_request)

        assert result == {
            'userid': 'acct:jeremy@weylandindustries.com',
            'username': 'jeremy',
            'email': 'jeremy@weylandtech.com',
            'authority': 'weylandindustries.com',
        }

    def test_signs_up_user(self,
                           auth_client,
                           factories,
                           pyramid_request,
                           user_signup_service,
                           valid_user):
        pyramid_request.authorization = _basic_auth(auth_client.id,
                                                    auth_client.secret)
        pyramid_request.json_body = valid_user
        user_signup_service.signup.return_value = factories.User(**valid_user)

        create(pyramid_request)

        user_signup_service.signup.assert_called_once_with(
            require_activation=False,
            authority='weylandindustries.com',
            username='jeremy',
            email='jeremy@weylandtech.com')

    def test_missing_creds(self,
                           pyramid_request,
                           user_signup_service,
                           valid_user):
        pyramid_request.authorization = None
        pyramid_request.json_body = valid_user

        with pytest.raises(ClientUnauthorized):
            create(pyramid_request)

    def test_missing_client(self,
                            pyramid_request,
                            user_signup_service,
                            valid_user):
        pyramid_request.authorization = _basic_auth('79BDE831-3559-4A37-8AE7-7358E3E0BDF0',
                                                    'some secret')
        pyramid_request.json_body = valid_user

        with pytest.raises(ClientUnauthorized):
            create(pyramid_request)

    def test_invalid_secret(self,
                            auth_client,
                            pyramid_request,
                            user_signup_service,
                            valid_user):
        pyramid_request.authorization = _basic_auth(auth_client.id, 'wrong')
        pyramid_request.json_body = valid_user

        with pytest.raises(ClientUnauthorized):
            create(pyramid_request)


def _basic_auth(username, password):
    return ('Basic', base64.standard_b64encode(username + ':' + password))


@pytest.fixture
def auth_client(factories):
    return factories.AuthClient(authority='weylandindustries.com')


@pytest.fixture
def user_signup_service(db_session, factories, pyramid_config):
    service = Mock(spec_set=UserSignupService(default_authority='example.com',
                                              mailer=None,
                                              session=None,
                                              signup_email=None,
                                              stats=None))
    pyramid_config.register_service(service, name='user_signup')
    return service

@pytest.fixture
def valid_user():
    return {
        'authority': 'weylandindustries.com',
        'email': 'jeremy@weylandtech.com',
        'username': 'jeremy',
    }
