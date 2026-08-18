from unittest.mock import Mock, patch
import requests

from django.test import TestCase, override_settings

from socials.services.meta_graph import MetaGraphClient, MetaGraphError


def graph_response(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


@override_settings(META_APP_ID='app123', META_APP_SECRET='secret123')
class MetaGraphClientTests(TestCase):
    def setUp(self):
        self.client_service = MetaGraphClient()

    @patch('socials.services.meta_graph.requests.get')
    def test_exchange_code_returns_token(self, mock_get):
        mock_get.return_value = graph_response({'access_token': 'short-token'})
        token = self.client_service.exchange_code('the-code', 'http://cb')
        self.assertEqual(token, 'short-token')
        params = mock_get.call_args.kwargs['params']
        self.assertEqual(params['code'], 'the-code')
        self.assertEqual(params['client_id'], 'app123')

    @patch('socials.services.meta_graph.requests.get')
    def test_graph_error_raises_with_code(self, mock_get):
        mock_get.return_value = graph_response(
            {'error': {'message': 'Invalid OAuth access token', 'code': 190}},
            status_code=400,
        )
        with self.assertRaises(MetaGraphError) as ctx:
            self.client_service.exchange_code('bad', 'http://cb')
        self.assertEqual(ctx.exception.code, 190)

    @patch('socials.services.meta_graph.requests.get')
    def test_get_long_lived_token(self, mock_get):
        mock_get.return_value = graph_response(
            {'access_token': 'long-token', 'expires_in': 5184000}
        )
        result = self.client_service.get_long_lived_token('short-token')
        self.assertEqual(result['access_token'], 'long-token')
        self.assertEqual(result['expires_in'], 5184000)

    @patch('socials.services.meta_graph.requests.get')
    def test_list_pages(self, mock_get):
        mock_get.return_value = graph_response(
            {'data': [{'id': 'p1', 'name': 'Store', 'access_token': 'pt1'}]}
        )
        pages = self.client_service.list_pages('user-token')
        self.assertEqual(pages, [{'id': 'p1', 'name': 'Store', 'access_token': 'pt1'}])

    @patch('socials.services.meta_graph.requests.post')
    def test_subscribe_page(self, mock_post):
        mock_post.return_value = graph_response({'success': True})
        self.assertTrue(self.client_service.subscribe_page('p1', 'pt1'))
        url = mock_post.call_args.args[0]
        self.assertIn('/p1/subscribed_apps', url)

    @patch('socials.services.meta_graph.requests.get')
    def test_get_instagram_account_present(self, mock_get):
        def side_effect(url, **kwargs):
            if 'instagram_business_account' in kwargs.get('params', {}).get('fields', ''):
                return graph_response(
                    {'instagram_business_account': {'id': 'ig1'}, 'id': 'p1'}
                )
            return graph_response({'id': 'ig1', 'username': 'acme_store'})

        mock_get.side_effect = side_effect
        account = self.client_service.get_instagram_account('p1', 'pt1')
        self.assertEqual(account, {'id': 'ig1', 'username': 'acme_store'})

    @patch('socials.services.meta_graph.requests.get')
    def test_get_instagram_account_absent(self, mock_get):
        mock_get.return_value = graph_response({'id': 'p1'})
        self.assertIsNone(self.client_service.get_instagram_account('p1', 'pt1'))

    @patch('socials.services.meta_graph.requests.get')
    def test_exchange_code_raises_graph_error_on_connection_error(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectionError('Connection refused')
        with self.assertRaises(MetaGraphError) as ctx:
            self.client_service.exchange_code('the-code', 'http://cb')
        self.assertEqual(str(ctx.exception), 'Could not reach Facebook')

    @patch('socials.services.meta_graph.requests.get')
    def test_exchange_code_raises_graph_error_on_non_json_response(self, mock_get):
        response = Mock()
        response.status_code = 500
        response.json.side_effect = ValueError('Expecting value')
        mock_get.return_value = response
        with self.assertRaises(MetaGraphError) as ctx:
            self.client_service.exchange_code('the-code', 'http://cb')
        self.assertEqual(str(ctx.exception), 'Invalid response from Facebook')


@override_settings(META_APP_ID='app123', META_APP_SECRET='secret123')
class GranularScopeFallbackTests(TestCase):
    @patch('socials.services.meta_graph.requests.get')
    def test_list_pages_falls_back_to_granular_scopes(self, mock_get):
        def side_effect(url, **kwargs):
            if url.endswith('/me/accounts'):
                return graph_response({'data': []})
            if url.endswith('/debug_token'):
                return graph_response({'data': {'granular_scopes': [
                    {'scope': 'pages_show_list', 'target_ids': ['p42']},
                    {'scope': 'pages_messaging', 'target_ids': ['p42']},
                ]}})
            return graph_response({'id': 'p42', 'name': 'Granted Page', 'access_token': 'pt42'})

        mock_get.side_effect = side_effect
        pages = MetaGraphClient().list_pages('user-token')
        self.assertEqual(pages, [{'id': 'p42', 'name': 'Granted Page', 'access_token': 'pt42'}])

    @patch('socials.services.meta_graph.requests.get')
    def test_list_pages_empty_when_no_granular_pages(self, mock_get):
        def side_effect(url, **kwargs):
            if url.endswith('/me/accounts'):
                return graph_response({'data': []})
            return graph_response({'data': {'granular_scopes': []}})

        mock_get.side_effect = side_effect
        self.assertEqual(MetaGraphClient().list_pages('user-token'), [])

    @patch('socials.services.meta_graph.requests.get')
    def test_get_granted_instagram_account(self, mock_get):
        def side_effect(url, **kwargs):
            if url.endswith('/debug_token'):
                return graph_response({'data': {'granular_scopes': [
                    {'scope': 'instagram_basic', 'target_ids': ['ig42']},
                ]}})
            return graph_response({'id': 'ig42', 'username': 'granted_shop'})

        mock_get.side_effect = side_effect
        account = MetaGraphClient().get_granted_instagram_account('user-token')
        self.assertEqual(account, {'id': 'ig42', 'username': 'granted_shop'})

    @patch('socials.services.meta_graph.requests.get')
    def test_get_granted_instagram_account_absent(self, mock_get):
        mock_get.return_value = graph_response({'data': {'granular_scopes': []}})
        self.assertIsNone(MetaGraphClient().get_granted_instagram_account('user-token'))
