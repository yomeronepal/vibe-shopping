from cryptography.fernet import Fernet
from django.conf import settings


def get_fernet():
    """Return a Fernet instance built from settings.FERNET_KEY."""
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_token(plaintext):
    """Encrypt a token string, returning urlsafe ciphertext text."""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext):
    """Decrypt ciphertext produced by encrypt_token."""
    return get_fernet().decrypt(ciphertext.encode()).decode()
