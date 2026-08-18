from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from socials.crypto import decrypt_token, encrypt_token

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class CryptoTests(TestCase):
    def test_round_trip(self):
        token = 'EAAG-fake-page-token-123'
        encrypted = encrypt_token(token)
        self.assertNotEqual(encrypted, token)
        self.assertEqual(decrypt_token(encrypted), token)

    def test_ciphertext_differs_from_plaintext_format(self):
        encrypted = encrypt_token('secret')
        self.assertNotIn('secret', encrypted)
