# Vibe Shopping - Django Backend

A production-ready Django backend for the Vibe Shopping e-commerce platform, featuring asynchronous task processing with Celery, Redis caching, and Docker containerization.

## 🚀 Features

- **Django 5.0** - Modern Python web framework
- **Django REST Framework** - Powerful API toolkit
- **Celery** - Distributed task queue for async processing
- **Redis** - In-memory data store for caching and message brokering
- **PostgreSQL** - Robust relational database
- **Docker** - Containerized deployment for consistency
- **Split Settings** - Separate configurations for development/production

## 📋 Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- Git

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd vibe-shopping/backend
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and update the following variables:
- `SECRET_KEY` - Generate a new Django secret key
- `DB_PASSWORD` - Set a strong database password
- Email settings (if you plan to send emails)

### 3. Build and Start Docker Containers

```bash
# Build all services
docker-compose build

# Start all services in detached mode
docker-compose up -d
```

This will start the following services:
- **web** - Django application (port 8000)
- **db** - PostgreSQL database (port 5432)
- **redis** - Redis cache/broker (port 6379)
- **celery_worker** - Celery worker for async tasks
- **celery_beat** - Celery beat for scheduled tasks

### 4. Run Database Migrations

```bash
docker-compose exec web python manage.py migrate
```

### 5. Create a Superuser

```bash
docker-compose exec web python manage.py createsuperuser
```

### 6. Access the Application

- **API Base URL**: http://localhost:8000/api/
- **Admin Panel**: http://localhost:8000/admin/
- **Health Check**: http://localhost:8000/api/health/

## 📁 Project Structure

```
vibe-shopping/
└── backend/
    ├── vibe_shopping/          # Django project
    │   ├── settings/           # Split settings (base, dev, prod)
    │   ├── celery.py          # Celery configuration
    │   ├── urls.py            # Main URL configuration
    │   └── wsgi.py            # WSGI application
    ├── core/                   # Core application
    │   ├── models.py          # Database models
    │   ├── views.py           # API views
    │   ├── serializers.py     # DRF serializers
    │   ├── tasks.py           # Celery tasks
    │   └── urls.py            # App URL patterns
    ├── docker/
    │   └── Dockerfile         # Django container config
    ├── docker-compose.yml     # Multi-container orchestration
    ├── manage.py              # Django management script
    ├── requirements.txt       # Python dependencies
    ├── .env.example          # Environment template
    ├── .gitignore            # Git ignore rules
    └── README.md             # This file
```

## 🔧 Development Workflow

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f web
docker-compose logs -f celery_worker
docker-compose logs -f celery_beat
```

### Run Management Commands

```bash
# Make migrations
docker-compose exec web python manage.py makemigrations

# Create new app
docker-compose exec web python manage.py startapp appname

# Django shell
docker-compose exec web python manage.py shell
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes database data)
docker-compose down -v
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart web
```

## 📝 API Endpoints

### Health Check
```
GET /api/health/
```

### Products
```
GET    /api/products/          # List all products
POST   /api/products/          # Create product
GET    /api/products/{id}/     # Retrieve product
PUT    /api/products/{id}/     # Update product
PATCH  /api/products/{id}/     # Partial update
DELETE /api/products/{id}/     # Delete product
```

### Admin Panel
```
/admin/  # Django admin interface
```

## 🔄 Celery Tasks

The project includes sample Celery tasks in `backend/core/tasks.py`:

- `send_email_task` - Send emails asynchronously
- `process_order_task` - Process orders in background
- `cleanup_old_data` - Scheduled daily cleanup (2:00 AM)
- `generate_report_task` - Generate various reports

### Scheduled Social Media Publishing

Post scheduling is powered by `django_celery_beat`'s `DatabaseScheduler`, backed by two tasks in `socials/tasks.py`:

- `publish_due_posts` - runs every 60 seconds via the `Publish due social posts` `PeriodicTask` (seeded by the `socials.0002_publish_due_schedule` data migration). It claims `SocialMediaPost` rows with `status='scheduled'` and `scheduled_for <= now` using `select_for_update(skip_locked=True)`, flips them to `pending`, and queues `publish_scheduled_post` for each claimed row.
- `publish_scheduled_post(post_id)` - publishes one claimed post via `socials.services.publisher.publish_post_record`. Transient network failures (`TransientPublishError`) are retried up to twice with a 60 second delay; once retries are exhausted the post is marked `failed` with the error recorded on it.

`django_celery_beat` must be listed in `INSTALLED_APPS` and its tables migrated for the schedule to load:

```bash
docker-compose exec web python manage.py migrate django_celery_beat
docker-compose exec web python manage.py migrate socials
```

### Testing Celery Tasks

```bash
# Access Django shell
docker-compose exec web python manage.py shell

# Run a task
>>> from core.tasks import send_email_task
>>> result = send_email_task.delay('test@example.com', 'Test Subject', 'Test message')
>>> result.ready()  # Check if task completed
>>> result.get()    # Get task result
```

## 🗄️ Database Management

### Backup Database

```bash
docker-compose exec db pg_dump -U postgres vibe_shopping_db > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T db psql -U postgres vibe_shopping_db
```

### Access PostgreSQL Shell

```bash
docker-compose exec db psql -U postgres -d vibe_shopping_db
```

## 🧪 Testing

```bash
# Run tests
docker-compose exec web python manage.py test

# Run with coverage
docker-compose exec web coverage run --source='.' manage.py test
docker-compose exec web coverage report
```

## 🚀 Production Deployment

For production deployment:

1. Set `DJANGO_ENV=production` in `.env`
2. Update `ALLOWED_HOSTS` with your domain
3. Generate a strong `SECRET_KEY`
4. Configure proper email settings
5. Set up SSL/TLS certificates
6. Use a reverse proxy (Nginx) for static files
7. Enable PostgreSQL backups

## 🛡️ Security Considerations

- Never commit `.env` files to version control
- Use strong passwords for database and Django secret key
- Keep dependencies updated regularly
- Enable HTTPS in production
- Configure CORS properly for your frontend domain
- Review and update security settings in `settings/production.py`

## 📚 Additional Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Celery Documentation](https://docs.celeryproject.org/)
- [Docker Documentation](https://docs.docker.com/)

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if database is running
docker-compose ps db

# View database logs
docker-compose logs db
```

### Celery Worker Not Processing Tasks
```bash
# Check worker logs
docker-compose logs celery_worker

# Restart worker
docker-compose restart celery_worker
```

### Port Already in Use
```bash
# Find process using port
netstat -ano | findstr :8000  # Windows
lsof -i :8000                  # Mac/Linux

# Stop the process or change port in docker-compose.yml
```

## 📄 License

This project is licensed under the MIT License.

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
