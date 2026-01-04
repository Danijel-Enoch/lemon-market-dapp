# Intent Based Actions

In the Lemon Market codebase, we use a pattern called **Intent Based Actions**. This pattern allows a single `action` function in a route to handle multiple distinct mutations (e.g., add liquidity, remove liquidity) by identifying the "intent" of the request.

## The Concept

Instead of having multiple endpoints or complex routing logic for different operations on the same resource, we use a single `action` function that extracts an `intent` field from the submitted `formData`. This makes the backend logic centralized and easier to manage.

## Extracting Intent

In your `action` function, you can extract the `intent` like this:

```typescript
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "add-liquidity") {
    // Handle deployment
  }

  if (intent === "remove-liquidity") {
    // Handle restart
  }

  return null;
}
```

## Usage with `useFetcher`

`useFetcher` is ideal for mutations that don't require a full page navigation (e.g., clicking a "Restart" button in a menu).

```tsx
const fetcher = useFetcher();

// Triggering the action
fetcher.submit(
  { intent: "restart", appId: "my-app-id" },
  { method: "post" }
);

// Handling states
const isRestarting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "restart";
```

## Usage with `<Form>`

For standard form submissions, use a hidden input field to pass the `intent`.

```tsx
import { Form } from "@app/components";

function ProfileSettings() {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="profile" />
      <Input label="First Name" name="firstName" />
      <button type="submit">Save Changes</button>
    </Form>
  );
}
```

## The `Form` Component and `data-intent`

Our custom `Form` component (in `app/components/ui/form.tsx`) is designed to work seamlessly with this pattern. It uses the `data-intent` prop to selectively display success or error messages only for the specific operation being performed.

```tsx
<Form method="post" data-intent="profile">
  <input type="hidden" name="intent" value="profile" />
  {/* Error/Success messages for "profile" intent will be shown here */}
</Form>
```

### How it works:
The `Form` component checks if the `intent` in `actionData` or `loaderData` matches the `data-intent` passed to the component:

```typescript
const error = actionData?.intent === dataIntent ? actionData?.error : loaderData?.error;
const success = actionData?.intent === dataIntent ? actionData?.success : loaderData?.success;
```

This prevents a success message from one form (e.g., "Profile updated") from accidentally appearing on another form (e.g., "Organization details") when multiple forms exist on the same page.
