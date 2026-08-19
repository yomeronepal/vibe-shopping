from django.db import migrations

TASK_NAME = 'Refresh social post engagement'


def create_schedule(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule, _ = IntervalSchedule.objects.get_or_create(every=5, period='minutes')
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={'task': 'socials.tasks.refresh_recent_engagement', 'interval': schedule},
    )


def remove_schedule(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('socials', '0002_publish_due_schedule'),
        ('django_celery_beat', '__latest__'),
    ]

    operations = [
        migrations.RunPython(create_schedule, remove_schedule),
    ]
