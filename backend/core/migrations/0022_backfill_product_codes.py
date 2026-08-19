from django.db import migrations


def assign_missing_codes(apps, schema_editor):
    """Give every existing product its VB-<id> SKU."""
    Product = apps.get_model('core', 'Product')
    for product in Product.objects.filter(product_code=''):
        product.product_code = f'VB-{product.pk:06d}'
        product.save(update_fields=['product_code'])


def noop(apps, schema_editor):
    """Generated SKUs are harmless to keep on rollback."""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_order_metadata'),
    ]

    operations = [
        migrations.RunPython(assign_missing_codes, noop),
    ]
