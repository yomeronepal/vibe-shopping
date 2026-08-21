from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile


class TeamTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Team Shop', subdomain='teamshop', metadata={})
        self.owner = User.objects.create_user(username='team_owner', password='pass12345')
        VendorProfile.objects.create(user=self.owner, tenant=self.tenant, role='owner')
        self.owner_token = Token.objects.create(user=self.owner)

    def as_owner(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.owner_token.key}')

    def create_staff(self, name='Sita Staff'):
        self.as_owner()
        return self.client.post('/api/vendor/team/', {'name': name})


class TeamCreationTests(TeamTestBase):
    def test_owner_creates_staff_with_one_time_password(self):
        response = self.create_staff()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['role'], 'staff')
        self.assertTrue(response.data['password'])
        self.assertTrue(response.data['username'].startswith('teamshop-'))
        login = self.client.post('/api/auth/login/', {
            'username': response.data['username'], 'password': response.data['password'],
        })
        self.assertEqual(login.status_code, 200)

    def test_staff_cannot_manage_team(self):
        created = self.create_staff()
        staff = User.objects.get(username=created.data['username'])
        token = Token.objects.create(user=staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.post('/api/vendor/team/', {'name': 'Another Person'})
        self.assertEqual(response.status_code, 403)

    def test_staff_cannot_change_settings(self):
        created = self.create_staff()
        staff = User.objects.get(username=created.data['username'])
        token = Token.objects.create(user=staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.patch('/api/vendor/profile/', {'bio': 'hacked'})
        self.assertEqual(response.status_code, 403)

    def test_staff_can_view_team(self):
        created = self.create_staff()
        staff = User.objects.get(username=created.data['username'])
        token = Token.objects.create(user=staff)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get('/api/vendor/team/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['your_role'], 'staff')
        self.assertEqual(len(response.data['members']), 2)


class TeamManagementTests(TeamTestBase):
    def test_deactivate_blocks_login(self):
        created = self.create_staff()
        user_id = created.data['id']
        response = self.client.patch(f'/api/vendor/team/{user_id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])
        login = self.client.post('/api/auth/login/', {
            'username': created.data['username'], 'password': created.data['password'],
        })
        self.assertNotEqual(login.status_code, 200)

    def test_password_reset_returns_new_secret(self):
        created = self.create_staff()
        response = self.client.post(f'/api/vendor/team/{created.data["id"]}/reset-password/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['password'])
        self.assertNotEqual(response.data['password'], created.data['password'])

    def test_owner_row_is_protected(self):
        self.as_owner()
        response = self.client.patch(f'/api/vendor/team/{self.owner.id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 400)
