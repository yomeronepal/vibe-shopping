TRIAL_DAYS = 14
GRACE_DAYS = 3
TRIAL_PLAN = 'growth'

PLANS = {
    'starter': {
        'name': 'Starter',
        'price': 2999,
        'monthly_ai_replies': 500,
        'pitch': 'For shops getting started with an AI assistant.',
    },
    'growth': {
        'name': 'Growth',
        'price': 5999,
        'monthly_ai_replies': 2000,
        'pitch': 'For busy pages selling every day in chat.',
    },
    'pro': {
        'name': 'Pro',
        'price': 11999,
        'monthly_ai_replies': None,
        'pitch': 'Unlimited AI replies for high-volume sellers.',
    },
}

PLAN_CHOICES = [(key, value['name']) for key, value in PLANS.items()]


def plan_reply_limit(plan):
    """Monthly AI-reply cap for a plan; None means unlimited."""
    return PLANS.get(plan, PLANS[TRIAL_PLAN])['monthly_ai_replies']


def serialize_plans():
    """Plan cards for the vendor-facing billing page."""
    return [
        {
            'key': key,
            'name': value['name'],
            'price': value['price'],
            'monthly_ai_replies': value['monthly_ai_replies'],
            'pitch': value['pitch'],
        }
        for key, value in PLANS.items()
    ]
