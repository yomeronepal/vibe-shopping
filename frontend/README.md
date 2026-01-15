# Vibe Shopping - Frontend

Modern React + TypeScript e-commerce frontend built with Vite, Tailwind CSS, and Redux Toolkit.

## 🚀 Features

- ⚡️ **Vite** - Lightning fast build tool
- ⚛️ **React 18** + **TypeScript** - Type-safe modern React
- 🎨 **Tailwind CSS** - Utility-first styling with custom design system
- 🔄 **Redux Toolkit** - Powerful state management
- 🛣️ **React Router v6** - Client-side routing
- 📡 **Axios** - HTTP client with interceptors
- 🎭 **Framer Motion** - Smooth animations
- 🔔 **React Hot Toast** - Beautiful notifications
- 🎯 **Heroicons** - Premium icon set

## 📦 Installation

```bash
cd frontend
npm install
```

## 🛠️ Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🌐 Environment Variables

Create a `.env` file:

```env
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME=Vibe Shopping
```

## 📁 Project Structure

```
src/
├── api/                # API services
│   ├── client.ts      # Axios instance
│   └── products.ts    # Product API
├── components/
│   ├── common/        # Reusable components
│   ├── layout/        # Layout components
│   └── products/      # Product components
├── features/          # Redux slices
│   ├── auth/
│   └── cart/
├── pages/             # Route pages
├── store/             # Redux store
├── App.tsx           # Main app component
└── main.tsx          # Entry point
```

## 🎨 Design System

- **Colors**: Custom primary/secondary gradients
- **Fonts**: Inter (body), Outfit (display)
- **Effects**: Glassmorphism, animations
- **Components**: Fully responsive design

## 🔗 API Integration

The frontend connects to the Django backend at `http://localhost:8000/api`.

Make sure the backend is running before starting the frontend.

## 📱 Pages

- `/` - Home page with hero and features
- `/products` - Product listing
- `/cart` - Shopping cart

## 🛒 Cart Features

- Add/remove products
- Update quantities
- Persistent storage (localStorage)
- Real-time total calculation

## 🚀 Build for Production

```bash
npm run build
```

The optimized build will be in the `dist/` directory.

## 📄 License

MIT
