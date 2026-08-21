import re
import secrets

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import VendorProfile

from .order_views import get_request_tenant

STAFF_ROLES = ('staff', 'manager')


def is_owner(request):
    """Whether the requesting user owns their business."""
    profile = getattr(request.user, 'vendor_profile', None)
    return bool(profile and profile.role == 'owner')


def serialize_member(profile):
    """One team member row for the UI."""
    user = profile.user
    return {
        'id': user.id,
        'username': user.username,
        'name': user.first_name or user.username,
        'email': user.email,
        'role': profile.role,
        'is_active': user.is_active,
        'last_login': user.last_login,
        'joined_at': profile.created_at,
    }


def generate_username(tenant, name):
    """Derive a unique login username from the staff member's name."""
    base = re.sub(r'[^a-z0-9]', '', name.lower())[:20] or 'staff'
    candidate = f'{tenant.subdomain or "shop"}-{base}'[:28]
    username = candidate
    counter = 1
    while User.objects.filter(username=username).exists():
        counter += 1
        username = f'{candidate}{counter}'
    return username


def generate_password():
    """Short, shareable one-time password."""
    return secrets.token_urlsafe(6)


class TeamView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List everyone with access to this business."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        members = VendorProfile.objects.filter(tenant=tenant).select_related('user').order_by('created_at')
        return Response({
            'members': [serialize_member(profile) for profile in members],
            'your_role': request.user.vendor_profile.role,
        })

    def post(self, request):
        """Create a staff account; returns the one-time password."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_owner(request):
            return Response({'error': 'Only the owner can manage the team.'}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data.get('name') or '').strip()
        if len(name) < 2:
            return Response({'error': 'Enter the staff member\'s name.'}, status=status.HTTP_400_BAD_REQUEST)
        role = request.data.get('role', 'staff')
        if role not in STAFF_ROLES:
            role = 'staff'
        email = (request.data.get('email') or '').strip()
        username = generate_username(tenant, name)
        password = generate_password()
        user = User.objects.create_user(
            username=username, password=password, email=email, first_name=name[:150],
        )
        profile = VendorProfile.objects.create(user=user, tenant=tenant, role=role)
        member = serialize_member(profile)
        member['password'] = password
        return Response(member, status=status.HTTP_201_CREATED)


class TeamMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def get_member(self, request, user_id):
        """Return the target profile when the caller may manage it."""
        tenant = get_request_tenant(request)
        if not tenant or not is_owner(request):
            return None, Response({'error': 'Only the owner can manage the team.'}, status=status.HTTP_403_FORBIDDEN)
        profile = VendorProfile.objects.filter(tenant=tenant, user_id=user_id).select_related('user').first()
        if profile is None:
            return None, Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)
        if profile.role == 'owner':
            return None, Response({'error': 'The owner account cannot be changed here.'}, status=status.HTTP_400_BAD_REQUEST)
        return profile, None

    def patch(self, request, user_id):
        """Change a member's role or active state."""
        profile, error = self.get_member(request, user_id)
        if error:
            return error
        role = request.data.get('role')
        if role in STAFF_ROLES:
            profile.role = role
            profile.save(update_fields=['role'])
        if 'is_active' in request.data:
            profile.user.is_active = bool(request.data['is_active'])
            profile.user.save(update_fields=['is_active'])
        return Response(serialize_member(profile))


class TeamPasswordResetView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        """Issue a fresh one-time password for a staff member."""
        member_view = TeamMemberView()
        profile, error = member_view.get_member(request, user_id)
        if error:
            return error
        password = generate_password()
        profile.user.set_password(password)
        profile.user.save(update_fields=['password'])
        member = serialize_member(profile)
        member['password'] = password
        return Response(member)
