# Speed Testing Guide

## How to Test the Optimizations

### 1. Start the Backend
```bash
cd backend
npm start
```

### 2. Start the Frontend
```bash
cd frontend
npm run dev
```

### 3. Navigate to FYP and observe:
- **Initial load**: Metadata appears instantly (~200-300ms)
- **First image**: Loads after ~500-800ms with spinner
- **Scroll**: Next images load smoothly from prefetch
- **Repeats**: Load instantly from cache

## Browser DevTools - Network Tab
1. Open DevTools (F12)
2. Filter by Fetch/XHR
3. Look for `/api/fyp` - should be <300ms, ~20KB gzipped
4. Look for `/api/posts/:id/image` - should be <500ms, gzipped
5. Check headers have `Content-Encoding: gzip`

## Expected Performance
- Feed load: <300ms
- First image: <800ms  
- Scroll: 60fps smooth
- Repeats: <100ms
