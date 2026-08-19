from django.db import migrations


def create_schedule(apps, schema_editor):
    """Run the abandoned-order follow-up sweep every hour."""
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule, _ = IntervalSchedule.objects.get_or_create(every=1, period='hours')
    PeriodicTask.objects.get_or_create(
        name='Send abandoned order follow-ups',
        defaults={
            'interval': schedule,
            'task': 'inbox.tasks.send_abandoned_order_followups',
        },
    )


def drop_schedule(apps, schema_editor):
    """Remove the follow-up sweep schedule."""
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='Send abandoned order follow-ups').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inbox', '0007_conversation_followup_sent_at_and_more'),
        ('django_celery_beat', '__latest__'),
    ]

    operations = [
        migrations.RunPython(create_schedule, drop_schedule),
    ]
