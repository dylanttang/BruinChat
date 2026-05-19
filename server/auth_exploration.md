# Auth Exploration

Authentication strategy for BruinChat with UCLA email verification.

---

## UCLA Email Restriction Options

### Option 1: Domain Validation (Simplest)
- Accept only `@ucla.edu` and `@g.ucla.edu` email addresses
- Validate on signup with regex: `^[a-zA-Z0-9._%+-]+@(g\.)?ucla\.edu$`
- **Pros:** Zero external dependencies, instant validation
- **Cons:** Doesn't verify email ownership until confirmation

### Option 2: Email Verification Link
- User signs up with UCLA email
- Send verification email with unique token
- Account activates only after clicking link
- **Pros:** Confirms email ownership
- **Cons:** Requires email service (SendGrid, Resend, etc.)

### Option 3: Google OAuth with Domain Check
- "Sign in with Google" flow
- After OAuth, check if email ends with `@ucla.edu` or `@g.ucla.edu`
- Reject non-UCLA Google accounts
- **Pros:** No password management, familiar UX
- **Cons:** Requires Google Cloud Console setup

---

## Lightweight MVP Solution

**Recommended: Option 1 + Option 2 (Hybrid)**

```
┌─────────────────────────────────────────────────┐
│  1. User enters UCLA email + password           │
│  2. Frontend validates @ucla.edu domain         │
│  3. Backend sends verification email            │
│  4. User clicks link → account activated        │
└─────────────────────────────────────────────────┘
```

### MVP Tech Stack
| Component | Tool | Why |
|-----------|------|-----|
| Auth Library | **Firebase Auth** or **Supabase Auth** | Handles passwords, sessions, email sending |
| Email Service | Built into Firebase/Supabase | No extra setup |
| Domain Check | Custom middleware | Simple regex validation |

### Implementation Checklist
- [ ] Set up Firebase/Supabase project
- [ ] Add email domain validation on signup
- [ ] Enable email verification requirement
- [ ] Create login/signup UI screens
- [ ] Store user profile in database after verification

---

## Quick Start Code (Firebase Example)

```javascript
// Domain validation
const isUclaEmail = (email) => {
  return /^[a-zA-Z0-9._%+-]+@(g\.)?ucla\.edu$/i.test(email);
};

// Signup flow
const signUp = async (email, password) => {
  if (!isUclaEmail(email)) {
    throw new Error('Please use your UCLA email address');
  }
  
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(userCredential.user);
  
  return userCredential.user;
};
```

---

## Future Enhancements
- Add Google OAuth as alternative login method
- Implement "Forgot Password" flow
- Consider 2FA for sensitive features
