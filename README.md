# Invoice Management Web App

A full-featured invoice management system built with React, Firebase, and Gmail integration.

## Features

✅ **Invoice Creation** - Create invoices with multiple line items
✅ **Invoice Management** - View, edit, and delete invoices  
✅ **PDF Export** - Download invoices as PDF files
✅ **Email Integration** - Send invoices directly to clients via Gmail
✅ **Payment Tracking** - Track invoice statuses (Draft, Sent, Paid)
✅ **Automatic Reminders** - Scheduled emails for upcoming due dates
✅ **User Authentication** - Secure Firebase authentication
✅ **Real-time Database** - Cloud Firestore for data storage
✅ **Tax & Discounts** - Support for tax calculations and discounts

## Project Structure

```
invoice-app/
├── public/              # Static files
├── src/
│   ├── components/      # Reusable components (Navbar)
│   ├── pages/           # Page components (Dashboard, CreateInvoice, InvoiceDetails)
│   ├── services/        # API services
│   ├── context/         # React Context (Auth)
│   ├── App.js           # Main app component
│   ├── firebase.js      # Firebase configuration
│   └── index.js         # Entry point
├── functions/           # Firebase Cloud Functions
│   └── src/
│       └── index.js     # Email sending functions
├── firebase.json        # Firebase configuration
├── firestore.rules      # Firestore security rules
└── .env.local           # Environment variables (local)
```

## Setup Instructions

### 1. Prerequisites

- Node.js 16+ installed
- Firebase account (free tier works)
- Gmail account (for sending emails)

### 2. Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication (Email/Password method)
3. Enable Firestore Database (select location, use production mode)
4. Get your Firebase config credentials

### 3. Environment Variables

Create `.env.local` in the project root:

```
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_SEND_EMAIL_URL=https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/sendInvoiceEmail
```

### 4. Gmail Setup (for email sending)

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use this password in Cloud Functions environment variables

### 5. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install functions dependencies
cd functions
npm install
cd ..
```

### 6. Deploy Firebase Cloud Functions

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Set your project
firebase use --add

# Deploy functions
firebase deploy --only functions
```

### 7. Set Environment Variables for Functions

```bash
npx firebase-tools login
npx firebase-tools use invoice-app-a3b90
npx firebase-tools functions:config:set gmail.user="your-email@gmail.com" gmail.password="your-app-password"
npx firebase-tools deploy --only functions
```

Notes:
- Use a Gmail App Password, not your normal Gmail password.
- The frontend calls the callable function `sendInvoiceEmailCallable` from Firebase Functions.
- If Gmail config is missing, the function now returns a clear setup error instead of a generic mail failure.

### 8. Run Locally

```bash
# Start the React app
npm start
```

The app will open at `http://localhost:3000`

## Usage

1. **Sign Up** - Create a new account with email/password
2. **Create Invoice** - Click "New Invoice" to create an invoice
3. **Add Line Items** - Add products/services with quantities and prices
4. **Save Invoice** - Save as draft
5. **Send Invoice** - View invoice and click "Send Email" to send to client
6. **Download PDF** - Export invoice as PDF
7. **Track Status** - Change invoice status from Draft → Sent → Paid

## Database Schema

### Invoices Collection

```json
{
  "clientName": "string",
  "clientEmail": "string",
  "clientTelephone": "string",
  "invoiceNumber": "string",
  "issueDate": "date",
  "dueDate": "date",
  "items": [
    {
      "description": "string",
      "quantity": "number",
      "unitPrice": "number"
    }
  ],
  "subtotal": "number",
  "tax": "number",
  "taxAmount": "number",
  "discount": "number",
  "discountAmount": "number",
  "total": "number",
  "notes": "string",
  "status": "draft|sent|paid",
  "userId": "string",
  "createdAt": "timestamp",
  "sentAt": "timestamp"
}
```

## Security

- Firestore rules ensure users can only access their own invoices
- Firebase Authentication provides secure user management
- Cloud Functions require authentication before sending emails
- Sensitive credentials stored in Firebase environment variables

## Customization

### Change Colors
Edit `src/App.css` and component CSS files to customize colors

### Add More Features
- Multi-currency support
- Invoice templates
- Client management
- Payment processing integration
- Expense tracking

### Deploy to Production
```bash
npm run build
firebase deploy
```

## Troubleshooting

**Email not sending?**
- Check Gmail App Password is correct
- Verify Firebase Functions are deployed
- Check Cloud Functions logs in Firebase Console

**Invoices not showing?**
- Verify user is logged in
- Check Firestore database has data
- Check browser console for errors

**PDF download not working?**
- Ensure PDF generation libraries are installed
- Check browser console for errors

## Support

For issues or questions:
1. Check Firebase Console for error logs
2. Review Cloud Functions logs for email errors
3. Verify environment variables are set correctly

## License

MIT
