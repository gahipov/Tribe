# GymApp

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Install shadcn/ui components
```bash
npx shadcn@latest init
```
When prompted: Style = Default, Base color = Slate, CSS variables = Yes

Then add all components:
```bash
npx shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar card carousel chart checkbox collapsible command context-menu dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs textarea toast toaster toggle toggle-group tooltip
```

### 3. Set up environment variables
Create a `.env` file:
```
VITE_BASE44_APP_ID=your_app_id_here
VITE_BASE44_FUNCTIONS_VERSION=prod
VITE_BASE44_APP_BASE_URL=https://your-app.base44.com
```

### 4. Run the app
```bash
npm run dev
```

### 5. Build for production
```bash
npm run build
```

## Publishing to iOS (Capacitor)

```bash
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init
npx cap add ios
npx cap sync
npx cap open ios
```
