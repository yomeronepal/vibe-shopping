# Generated manually to handle product_code unique constraint

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_socialmediapost'),
    ]

    operations = [
        # Add Order POS fields
        migrations.AddField(
            model_name='order',
            name='customer_email',
            field=models.EmailField(blank=True, help_text='Customer email for POS orders', max_length=254),
        ),
        migrations.AddField(
            model_name='order',
            name='customer_name',
            field=models.CharField(blank=True, help_text='Customer name for POS orders', max_length=255),
        ),
        migrations.AddField(
            model_name='order',
            name='customer_phone',
            field=models.CharField(blank=True, help_text='Customer phone for POS orders', max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='order_type',
            field=models.CharField(choices=[('online', 'Online'), ('pos', 'Point of Sale')], default='online', help_text='Order source: online or POS', max_length=20),
        ),
        
        # Add Product POS fields directly
        migrations.AddField(
            model_name='product',
            name='product_code',
            field=models.CharField(blank=True, db_index=True, help_text='Unique product code/SKU for POS checkout', max_length=20, unique=True),
        ),
        migrations.AddField(
            model_name='product',
            name='qr_code',
            field=models.ImageField(blank=True, help_text='QR code image for quick product checkout', null=True, upload_to='qr_codes/'),
        ),
        
        # Alter other fields
        migrations.AlterField(
            model_name='order',
            name='payment_method',
            field=models.CharField(choices=[('credit_card', 'Credit Card'), ('debit_card', 'Debit Card'), ('cash', 'Cash'), ('mobile_payment', 'Mobile Payment'), ('bank_transfer', 'Bank Transfer')], default='credit_card', max_length=50),
        ),
        migrations.AlterField(
            model_name='order',
            name='user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='orders', to='auth.user'),
        ),
    ]
