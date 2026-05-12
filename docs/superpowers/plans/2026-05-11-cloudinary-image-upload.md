# Cloudinary Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload profile avatars and send image attachments in chat, using client-side direct upload to Cloudinary with server-signed params.

**Architecture:** Client fetches a signed upload token from `GET /api/upload/signature`, uploads the file directly to Cloudinary, then sends the resulting `secure_url` to the server to persist in the DB. The API secret never leaves the server and the server handles no file data.

**Tech Stack:** Express (ESM), Mongoose, Cloudinary SDK (server-side signing only), React Native (Expo), expo-image-picker, TypeScript (client)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `server/routes/upload.js` | `GET /signature` — signs Cloudinary upload params |
| Modify | `server/index.js` | Mount `/api/upload` route |
| Modify | `server/routes/users.js` | Add `PUT /me/avatar` |
| Modify | `server/.env` | Add Cloudinary credentials |
| Create | `client/app/lib/cloudinary.ts` | `uploadToCloudinary(uri, folder)` helper |
| Modify | `client/app/tabs/profile.tsx` | Complete avatar upload TODO |
| Modify | `client/app/chat/[id].tsx` | Add image attachment button + mediaUrl in send payload |
| Modify | `client/app/components/messageBubble.tsx` | Render image when mediaUrl present |

---

## Task 1: Cloudinary Account Setup (Manual)

**Files:** `server/.env`

- [ ] **Step 1: Create Cloudinary account**

  Go to cloudinary.com, sign up for a free account.

- [ ] **Step 2: Create upload preset**

  In the Cloudinary dashboard → Settings → Upload → Upload Presets → Add upload preset:
  - Preset name: `bruinchat_signed`
  - Signing mode: **Signed**
  - Max file size: `5242880` (5MB in bytes)
  - Allowed formats: `jpg,png,webp,gif`
  - Save

- [ ] **Step 3: Add credentials to server/.env**

  Copy Cloud Name, API Key, API Secret from Dashboard → API Keys. Add to `server/.env`:
  ```
  CLOUDINARY_CLOUD_NAME=your_cloud_name
  CLOUDINARY_API_KEY=your_api_key
  CLOUDINARY_API_SECRET=your_api_secret
  ```

---

## Task 2: Server — Upload Signature Route

**Files:**
- Create: `server/routes/upload.js`
- Modify: `server/index.js`

- [ ] **Step 1: Install cloudinary SDK in server**

  ```bash
  cd server && npm install cloudinary
  ```

- [ ] **Step 2: Create server/routes/upload.js**

  ```js
  import { Router } from 'express';
  import { v2 as cloudinary } from 'cloudinary';
  import { devAuth } from '../middleware/devAuth.js';

  const router = Router();

  const ALLOWED_FOLDERS = new Set(['avatars', 'messages']);

  router.get('/signature', devAuth, (req, res) => {
    const { folder } = req.query;

    if (!folder || !ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ error: 'folder must be "avatars" or "messages"' });
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const timestamp = Math.round(Date.now() / 1000);
    const params = { folder, timestamp, upload_preset: 'bruinchat_signed' };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
    });
  });

  export default router;
  ```

- [ ] **Step 3: Mount route in server/index.js**

  Add import after the existing route imports:
  ```js
  import uploadRoutes from './routes/upload.js';
  ```

  Add mount after the existing `app.use('/api/users', ...)` line:
  ```js
  app.use('/api/upload', uploadRoutes);
  ```

- [ ] **Step 4: Smoke test the endpoint**

  Start the server (`npm run dev` in server/), then run:
  ```bash
  curl "http://localhost:3000/api/upload/signature?folder=avatars" \
    -H "x-user-id: <any_valid_user_id_from_db>"
  ```
  Expected: JSON with `signature`, `timestamp`, `apiKey`, `cloudName`, `folder`.

  Test invalid folder:
  ```bash
  curl "http://localhost:3000/api/upload/signature?folder=evil" \
    -H "x-user-id: <any_valid_user_id>"
  ```
  Expected: `400 { "error": "folder must be \"avatars\" or \"messages\"" }`

- [ ] **Step 5: Commit**

  ```bash
  git add server/routes/upload.js server/index.js server/package.json server/package-lock.json
  git commit -m "feat(upload): add GET /api/upload/signature with Cloudinary signing"
  ```

---

## Task 3: Server — PUT /api/users/me/avatar

**Files:**
- Modify: `server/routes/users.js`

- [ ] **Step 1: Add avatar endpoint to server/routes/users.js**

  Add this block before the `export default router` line:

  ```js
  // PUT /api/users/me/avatar
  router.put('/me/avatar', devAuth, async (req, res) => {
    try {
      const { avatarUrl } = req.body;

      if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('https://res.cloudinary.com/')) {
        return res.status(400).json({ error: 'avatarUrl must be a Cloudinary URL' });
      }

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { avatarUrl },
        { new: true }
      ).lean();

      return res.json({ avatarUrl: user.avatarUrl });
    } catch (err) {
      console.error('PUT /api/users/me/avatar error:', err);
      return res.status(500).json({ error: 'Failed to update avatar' });
    }
  });
  ```

- [ ] **Step 2: Smoke test the endpoint**

  ```bash
  curl -X PUT "http://localhost:3000/api/users/me/avatar" \
    -H "x-user-id: <any_valid_user_id>" \
    -H "Content-Type: application/json" \
    -d '{"avatarUrl":"https://res.cloudinary.com/demo/image/upload/sample.jpg"}'
  ```
  Expected: `200 { "avatarUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg" }`

  Test invalid URL:
  ```bash
  curl -X PUT "http://localhost:3000/api/users/me/avatar" \
    -H "x-user-id: <any_valid_user_id>" \
    -H "Content-Type: application/json" \
    -d '{"avatarUrl":"https://evil.com/photo.jpg"}'
  ```
  Expected: `400 { "error": "avatarUrl must be a Cloudinary URL" }`

- [ ] **Step 3: Commit**

  ```bash
  git add server/routes/users.js
  git commit -m "feat(users): add PUT /api/users/me/avatar"
  ```

---

## Task 4: Client — uploadToCloudinary Helper

**Files:**
- Create: `client/app/lib/cloudinary.ts`

- [ ] **Step 1: Create client/app/lib/cloudinary.ts**

  ```ts
  import { apiFetch } from './api';

  type UploadFolder = 'avatars' | 'messages';

  type SignatureResponse = {
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    folder: UploadFolder;
  };

  export async function uploadToCloudinary(
    uri: string,
    folder: UploadFolder
  ): Promise<string> {
    const sigRes = await apiFetch(`/api/upload/signature?folder=${folder}`);
    if (!sigRes.ok) {
      throw new Error('Failed to get upload signature');
    }
    const { signature, timestamp, apiKey, cloudName }: SignatureResponse =
      await sigRes.json();

    const formData = new FormData();
    formData.append('file', { uri, name: 'upload.jpg', type: 'image/jpeg' } as any);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('upload_preset', 'bruinchat_signed');

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      const message = (err as any)?.error?.message ?? '';
      if (message.toLowerCase().includes('file size')) {
        throw new Error('Image too large (max 5MB)');
      }
      throw new Error('Upload failed');
    }

    const data = await uploadRes.json();
    return data.secure_url as string;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add client/app/lib/cloudinary.ts
  git commit -m "feat(client): add uploadToCloudinary helper"
  ```

---

## Task 5: Client — Avatar Upload in profile.tsx

**Files:**
- Modify: `client/app/tabs/profile.tsx`

- [ ] **Step 1: Add uploadingAvatar state and import uploadToCloudinary**

  At the top of `profile.tsx`, add the import after the existing `apiFetch` import:
  ```ts
  import { uploadToCloudinary } from '../lib/cloudinary';
  ```

  In the `Profile` component, replace the `localAvatar` state declaration:
  ```ts
  // Remove this line:
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  // Add this line:
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  ```

- [ ] **Step 2: Replace pickAvatar function**

  Replace the existing `pickAvatar` function (lines 83–107) with:
  ```ts
  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo access to change your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadToCloudinary(uri, 'avatars');
      const res = await apiFetch('/api/users/me/avatar', {
        method: 'PUT',
        body: JSON.stringify({ avatarUrl }),
      });
      if (!res.ok) throw new Error('Failed to save avatar');
      setUser((prev) => prev ? { ...prev, avatarUrl } : prev);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Could not update avatar. Try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };
  ```

- [ ] **Step 3: Update avatarSource and avatar UI**

  Replace the `avatarSource` line:
  ```ts
  // Remove:
  const avatarSource = localAvatar ?? user?.avatarUrl ?? null;

  // Add:
  const avatarSource = user?.avatarUrl ?? null;
  ```

  Replace the avatar section in the JSX (the `<View style={styles.avatarWrapper}>` block) with:
  ```tsx
  <View style={styles.avatarWrapper}>
    {uploadingAvatar ? (
      <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg }]}>
        <ActivityIndicator color={colors.mutedText} />
      </View>
    ) : (
      <Image
        source={avatarSource ? { uri: avatarSource } : undefined}
        style={styles.avatar}
      />
    )}
    <TouchableOpacity style={styles.editAvatar} onPress={pickAvatar} disabled={uploadingAvatar}>
      <Ionicons name="pencil" size={16} color="white" />
    </TouchableOpacity>
  </View>
  ```

- [ ] **Step 4: Manual test**

  1. Run the app (`npm run client` from root).
  2. Go to Profile tab.
  3. Tap the pencil icon → pick an image.
  4. Verify spinner shows during upload.
  5. Verify the avatar updates after upload.
  6. Restart the app — verify the avatar persists (served from Cloudinary URL).

- [ ] **Step 5: Commit**

  ```bash
  git add client/app/tabs/profile.tsx
  git commit -m "feat(profile): wire up Cloudinary avatar upload"
  ```

---

## Task 6: Client — Image Attachments in Chat

**Files:**
- Modify: `client/app/chat/[id].tsx`
- Modify: `client/app/components/messageBubble.tsx`

- [ ] **Step 1: Add mediaUrl to Message type and imports in chat/[id].tsx**

  At the top of `client/app/chat/[id].tsx`, add imports:
  ```ts
  import * as ImagePicker from 'expo-image-picker';
  import { uploadToCloudinary } from '../lib/cloudinary';
  ```

  Update the `Message` type to include `mediaUrl`:
  ```ts
  type Message = {
    _id: string;
    text: string;
    mediaUrl?: string | null;
    createdAt: string;
    senderId: { _id: string; displayName: string; avatarUrl: string };
    replyTo?: { _id: string; text: string; senderId: { displayName: string } } | null;
  };
  ```

  Add `uploadingMedia` state in the component alongside the existing state declarations:
  ```ts
  const [uploadingMedia, setUploadingMedia] = useState(false);
  ```

- [ ] **Step 2: Add pickAndSendImage function**

  Add this function after the existing `sendMessage` function:
  ```ts
  const pickAndSendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo access to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setUploadingMedia(true);
    try {
      const mediaUrl = await uploadToCloudinary(uri, 'messages');
      const res = await apiFetch(`/api/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: '', mediaUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [data.message, ...prev]);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Could not send image. Try again.');
    } finally {
      setUploadingMedia(false);
    }
  };
  ```

  Add `Alert` to the React Native imports at the top of the file:
  ```ts
  import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Image,
  } from 'react-native';
  ```

- [ ] **Step 3: Wire up the ＋ button and pass mediaUrl to MessageBubble**

  Replace the `<TouchableOpacity style={styles.plusBtn}>` block in the input bar JSX with:
  ```tsx
  <TouchableOpacity style={styles.plusBtn} onPress={pickAndSendImage} disabled={uploadingMedia || sending}>
    {uploadingMedia
      ? <ActivityIndicator size="small" color={colors.mutedText} />
      : <Text style={{ fontSize: 22, color: colors.text }}>＋</Text>
    }
  </TouchableOpacity>
  ```

  Update the `MessageBubble` render call to pass `mediaUrl`:
  ```tsx
  <MessageBubble
    item={{
      id: msg._id,
      user: msg.senderId.displayName,
      text: msg.text,
      mediaUrl: msg.mediaUrl ?? null,
      time: formatTime(msg.createdAt),
      mine: currentUserId === msg.senderId._id,
      replyTo: msg.replyTo ?? null,
    }}
    onLongPress={() => setReplyingTo(msg)}
  />
  ```

- [ ] **Step 4: Render image in messageBubble.tsx**

  Update the `Props` type to include `mediaUrl`:
  ```ts
  type Props = {
    item: {
      id: string;
      user: string;
      text: string;
      mediaUrl?: string | null;
      time: string;
      mine: boolean;
      replyTo?: { _id: string; text: string; senderId: { displayName: string } } | null;
    };
    onLongPress?: () => void;
  };
  ```

  Add `Image` to the React Native import at the top of `messageBubble.tsx`:
  ```ts
  import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
  ```

  Inside the bubble `<View>`, add image rendering after the `replyTo` block and before the text:
  ```tsx
  {item.mediaUrl && (
    <Image
      source={{ uri: item.mediaUrl }}
      style={{ width: 200, height: 200, borderRadius: 12, marginBottom: item.text ? 6 : 0 }}
      resizeMode="cover"
    />
  )}
  ```

  Wrap the text in a conditional so it doesn't render an empty bubble when text is empty:
  ```tsx
  {!!item.text && (
    <Text style={{ color: isMe ? 'white' : colors.text, fontSize: 16 }}>
      {item.text}
    </Text>
  )}
  ```

- [ ] **Step 5: Manual test**

  1. Open a chat.
  2. Tap the ＋ button → pick an image.
  3. Verify spinner shows during upload.
  4. Verify image renders in the message bubble after send.
  5. Reload the chat — verify image persists.
  6. Test with text message — verify existing text flow unaffected.

- [ ] **Step 6: Commit**

  ```bash
  git add client/app/chat/[id].tsx client/app/components/messageBubble.tsx
  git commit -m "feat(chat): add image attachment upload via Cloudinary"
  ```
