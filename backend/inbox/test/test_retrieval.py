from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import (
    MAX_PRODUCTS,
    coerce_extracted_item,
    extract_search_terms,
    load_referenced_products,
    load_recommended_products,
    select_relevant_products,
)
from socials.models import ConnectedPage, MetaConnection


class RetrievalTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Mega Store', subdomain='mega')
        self.user = User.objects.create_user(username='mega_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbmega')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pmega',
            name='Mega', status='connected',
        )
        page.set_access_token('pt-mega')
        page.save()
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-m', name='Gita',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )

    def say(self, text):
        return Message.objects.create(
            conversation=self.convo, direction='in', text=text,
            platform_message_id=f'mid-{Message.objects.count()}',
            sent_at=timezone.now(),
        )

    def add_products(self, count, name='Filler Item'):
        for index in range(count):
            Product.objects.create(
                tenant=self.tenant, name=f'{name} {index}', price=500,
                stock=3, status='published', is_active=True,
            )


class SearchTermTests(RetrievalTestBase):
    def test_extracts_distinct_terms_skipping_stopwords(self):
        self.say('Namaste, kati price hola leather jacket ko?')
        terms = extract_search_terms(self.convo)
        self.assertIn('leather', terms)
        self.assertIn('jacket', terms)
        self.assertNotIn('namaste', terms)
        self.assertNotIn('kati', terms)

    def test_includes_comment_product_context(self):
        message = self.say('pp?')
        message.metadata = {'product_name': 'Pashmina Shawl'}
        message.save(update_fields=['metadata'])
        terms = extract_search_terms(self.convo)
        self.assertIn('pashmina', terms)


class RelevantProductTests(RetrievalTestBase):
    def test_small_catalog_returned_whole(self):
        self.add_products(5)
        picked = select_relevant_products(self.tenant, self.convo)
        self.assertEqual(len(picked), 5)

    def test_large_catalog_ranks_keyword_matches_first(self):
        self.add_products(MAX_PRODUCTS + 10)
        target = Product.objects.create(
            tenant=self.tenant, name='Leather Jacket Premium', price=4500,
            stock=2, status='published', is_active=True,
        )
        self.say('leather jacket chahiyo')
        picked = select_relevant_products(self.tenant, self.convo)
        self.assertEqual(len(picked), MAX_PRODUCTS)
        self.assertEqual(picked[0].id, target.id)

    def test_large_catalog_finds_quoted_sku(self):
        self.add_products(MAX_PRODUCTS + 10)
        target = Product.objects.create(
            tenant=self.tenant, name='Wool Scarf', price=900,
            stock=6, status='published', is_active=True,
        )
        self.say(f'I want {target.product_code}')
        picked = select_relevant_products(self.tenant, self.convo)
        self.assertEqual(picked[0].id, target.id)

    def test_no_matches_falls_back_to_newest(self):
        self.add_products(MAX_PRODUCTS + 5)
        self.say('zzzunknownzzz')
        picked = select_relevant_products(self.tenant, self.convo)
        self.assertEqual(len(picked), MAX_PRODUCTS)


class SkuGroundingTests(RetrievalTestBase):
    def test_item_resolves_by_sku_when_id_missing(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Silk Tie', price=700,
            stock=5, status='published', is_active=True,
        )
        raw = [{'sku': product.product_code.lower(), 'quantity': 2}]
        by_id, by_sku = load_referenced_products(self.tenant, raw)
        item = coerce_extracted_item(raw[0], by_id, by_sku)
        self.assertEqual(item['product_id'], product.id)
        self.assertEqual(item['sku'], product.product_code)
        self.assertEqual(item['quantity'], 2)

    def test_unknown_sku_and_id_rejected(self):
        raw = [{'sku': 'NOPE-999', 'product_id': 424242, 'quantity': 1}]
        by_id, by_sku = load_referenced_products(self.tenant, raw)
        self.assertIsNone(coerce_extracted_item(raw[0], by_id, by_sku))

    def test_referenced_lookup_only_fetches_named_products(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Denim Cap', price=350,
            stock=9, status='published', is_active=True,
        )
        self.add_products(4)
        by_id, by_sku = load_referenced_products(self.tenant, [{'product_id': product.id}])
        self.assertEqual(list(by_id), [product.id])


class RecommendedProductTests(RetrievalTestBase):
    def test_loads_valid_ids_in_order_capped_at_three(self):
        self.add_products(5, name='Reco Item')
        products = list(Product.objects.filter(tenant=self.tenant).order_by('id'))
        ids = [products[2].id, products[0].id, 999999, products[1].id, products[3].id]
        picked = load_recommended_products(self.tenant, {'recommended_product_ids': ids})
        self.assertEqual([p.id for p in picked], [products[2].id, products[0].id, products[1].id])

    def test_non_list_returns_empty(self):
        self.assertEqual(load_recommended_products(self.tenant, {'recommended_product_ids': 'x'}), [])


class ProductCardSendTests(RetrievalTestBase):
    @patch('inbox.services.sending.push_inbox_event')
    @patch('socials.services.meta_graph.MetaGraphClient.send_generic_template', return_value='mid-card-1')
    def test_sends_cards_and_records_message(self, mock_send, mock_push):
        from inbox.services.sending import send_product_cards

        self.say('show me caps')
        product = Product.objects.create(
            tenant=self.tenant, name='Denim Cap', price=350,
            stock=9, status='published', is_active=True,
        )
        record = send_product_cards(self.convo, [product])
        self.assertIsNotNone(record)
        elements = mock_send.call_args[0][3]
        self.assertEqual(elements[0]['title'], 'Denim Cap')
        self.assertIn('Rs. 350', elements[0]['subtitle'])
        self.assertIn(product.product_code, elements[0]['subtitle'])
        self.assertEqual(record.metadata['product_ids'], [product.id])

    @patch('socials.services.meta_graph.MetaGraphClient.send_generic_template')
    def test_skips_unanswered_comment_threads(self, mock_send):
        from inbox.services.sending import send_product_cards

        message = self.say('pp?')
        message.source = 'comment'
        message.save(update_fields=['source'])
        product = Product.objects.create(
            tenant=self.tenant, name='Wool Hat', price=450,
            stock=2, status='published', is_active=True,
        )
        self.assertIsNone(send_product_cards(self.convo, [product]))
        mock_send.assert_not_called()
