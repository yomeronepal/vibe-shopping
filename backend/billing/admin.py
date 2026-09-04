from django.contrib import admin

from .models import PaymentRecord, Subscription


class PaymentRecordInline(admin.TabularInline):
    model = PaymentRecord
    extra = 1
    readonly_fields = ('recorded_at',)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'plan', 'is_trial', 'current_period_end', 'status')
    list_filter = ('plan', 'is_trial')
    search_fields = ('tenant__name', 'tenant__subdomain')
    inlines = [PaymentRecordInline]

    @admin.display(description='Status')
    def status(self, obj):
        return obj.status


@admin.register(PaymentRecord)
class PaymentRecordAdmin(admin.ModelAdmin):
    list_display = ('subscription', 'amount', 'method', 'plan', 'days_granted', 'recorded_at')
    list_filter = ('method', 'plan')
    search_fields = ('subscription__tenant__name', 'reference')
