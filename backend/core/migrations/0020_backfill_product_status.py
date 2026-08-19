from django.db import migrations


def mark_active_products_published(apps, schema_editor):
    """Align status with visibility for products created before drafts."""
    Product = apps.get_model('core', 'Product')
    Product.objects.filter(is_active=True, status='draft').update(status='published')


def revert_to_draft(apps, schema_editor):
    """Reverse: restore the legacy always-draft status."""
    Product = apps.get_model('core', 'Product')
    Product.objects.filter(is_active=True, status='published').update(status='draft')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_socialmediapost_post_format'),
    ]

    operations = [
        migrations.RunPython(mark_active_products_published, revert_to_draft),
    ]
