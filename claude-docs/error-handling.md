# Error Handling Patterns

## Overview

This document defines comprehensive error handling strategies across backend (DMMF/Result patterns) and frontend (React error handling) layers.

## Quick Reference

### Backend Error Handling

- **Workflows**: Always use `Result<T,E>` patterns
- **Routes**: try-catch allowed at HTTP boundary
- **Repositories**: Internal try-catch, return Result

### Frontend Error Handling

- **Server Actions**: `ActionResult<T>` with success/error
- **Components**: try-catch + useState for errors
- **UI**: toast notifications + Alert components

## Backend Error Handling

### Architecture Layer Patterns

| Layer              | Error Handling Pattern | Rationale                                        |
| ------------------ | ---------------------- | ------------------------------------------------ |
| **HTTP Routes**    | try-catch allowed      | Boundary layer, prevents server crashes          |
| **Workflows**      | Result<T,E> only       | Pure functional domain logic, no exceptions      |
| **Repositories**   | Result<T,E> return     | Internal try-catch for DB errors, returns Result |
| **Infrastructure** | Result<T,E> return     | External service integration, returns Result     |

### Domain Error System

```typescript
// ✅ Structured error hierarchy
import {
  validationError,
  notFoundError,
  businessRuleViolationError,
  repositoryError,
  infrastructureError,
  type ValidationError,
  type NotFoundError,
  type RepositoryError,
  type InfrastructureError,
} from "@kikagaku-buddy/shared/errors";
```

### Workflow Error Handling

```typescript
// ✅ Error handling in workflows
function validateInput(data: unknown): Result<ValidData, ValidationError> {
  if (!data) {
    return err(validationError("data", "Data is required"));
  }
  return ok(data as ValidData);
}

function findEntity(id: string): Result<Entity, NotFoundError> {
  const entity = repository.find(id);
  if (!entity) {
    return err(notFoundError("Entity", id));
  }
  return ok(entity);
}

// ✅ Chain error transformation
export function workflowWithErrorHandling(deps: Deps) {
  return async (command: Command) => {
    return chain(command)
      .andThen(validateInput)
      .asyncAndThen(findEntity)
      .mapErr(transformDomainError) // Transform errors
      .toResult();
  };
}
```

### Repository Error Handling

```typescript
// ✅ Repository with internal try-catch, returns Result
export async function createUser(
  data: CreateUserData,
  db: PrismaClient
): Promise<Result<User, InfrastructureError>> {
  try {
    const user = await db.user.create({ data });
    return ok(user);
  } catch (error) {
    return err(infrastructureError("database", "create-user", error as Error));
  }
}
```

### Route Handler Error Handling

```typescript
// ✅ Route handler with try-catch (allowed at HTTP boundary)
app.get("/api/chats", async (c) => {
  try {
    const result = await getChatWorkflow(deps)(command);
    if (result.isErr) {
      return c.json({ error: result.error.message }, 400);
    }
    return c.json({ data: result.value });
  } catch (error) {
    // Caught by error middleware
    throw error;
  }
});
```

## Frontend Error Handling

### Client-Side Error Strategy

| Context            | Pattern                                | Rationale                         |
| ------------------ | -------------------------------------- | --------------------------------- |
| **Server Actions** | `ActionResult<T>` with success/error   | React ecosystem compatibility     |
| **Components**     | try-catch + useState for errors        | Standard React error handling     |
| **UI Feedback**    | toast notifications + Alert components | Consistent user experience        |
| **Loading States** | `isLoading` state alongside errors     | Complete async operation handling |

### Server Action Error Handling

```typescript
// ✅ Server Action error handling
export async function createChatAction(
  _prevState: ActionResult<Chat> | null,
  formData: FormData
): Promise<ActionResult<Chat>> {
  try {
    const validationResult = CreateChatSchema.safeParse(rawData);
    if (!validationResult.success) {
      return createErrorResult("Validation failed", fieldErrors);
    }

    const chat = await callBackendAPI<Chat>("/chats", { method: "POST", body });
    return createSuccessResult(chat);
  } catch (error) {
    return createErrorResult(error);
  }
}
```

### Component Error Handling

```typescript
// ✅ Complete component error handling pattern
const [error, setError] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(false);

const handleAction = async () => {
  try {
    setIsLoading(true);
    setError(null); // Clear previous errors

    const result = await someAction();

    if (!result.success) {
      setError(result.error || 'エラーが発生しました');
      return;
    }

    // Success handling
    toast.success('成功しました');
    onSuccess?.(result.data);

  } catch (_err) {
    setError('予期しないエラーが発生しました');
  } finally {
    setIsLoading(false);
  }
};

// ✅ Error display patterns
return (
  <div>
    {error && (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}

    <Button onClick={handleAction} disabled={isLoading}>
      {isLoading ? 'Processing...' : 'Submit'}
    </Button>
  </div>
);
```

### Form Error Handling with useActionState

```typescript
// ✅ Form error handling with React 19
import { useActionState } from 'react';

function ChatForm() {
  const [state, formAction] = useActionState(createChatAction, null);

  return (
    <form action={formAction}>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state?.fieldErrors && (
        <div>
          {Object.entries(state.fieldErrors).map(([field, errors]) => (
            <p key={field} className="text-red-500 text-sm">
              {field}: {errors.join(', ')}
            </p>
          ))}
        </div>
      )}

      <input name="title" required />
      <button type="submit">Create Chat</button>
    </form>
  );
}
```

## Error Types & Hierarchy

### Backend Error Types

```typescript
// Domain-specific errors
type ValidationError = {
  type: "validation";
  field: string;
  message: string;
};

type NotFoundError = {
  type: "not-found";
  entity: string;
  id: string;
};

type BusinessRuleViolationError = {
  type: "business-rule-violation";
  rule: string;
  context: Record<string, unknown>;
};

type RepositoryError = {
  type: "repository";
  operation: string;
  details: string;
};

type InfrastructureError = {
  type: "infrastructure";
  service: string;
  operation: string;
  cause: Error;
};
```

### Frontend Error Types

```typescript
// Client-side error result types
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

type ErrorState = {
  message: string | null;
  isLoading: boolean;
  fieldErrors?: Record<string, string[]>;
};
```

## Error Recovery Patterns

### Retry Logic

```typescript
// ✅ Client-side retry pattern
const useRetryableAction = <T>(action: () => Promise<ActionResult<T>>) => {
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const executeWithRetry = async () => {
    try {
      const result = await action();
      if (!result.success && retryCount < maxRetries) {
        setRetryCount((prev) => prev + 1);
        return executeWithRetry();
      }
      return result;
    } catch (error) {
      if (retryCount < maxRetries) {
        setRetryCount((prev) => prev + 1);
        return executeWithRetry();
      }
      throw error;
    }
  };

  return { executeWithRetry, retryCount, canRetry: retryCount < maxRetries };
};
```

## Common Pitfalls

### Backend Anti-Patterns

```typescript
// ❌ Don't throw exceptions in workflows
function badWorkflow(data: unknown) {
  if (!data) {
    throw new Error("Invalid data"); // ❌ Use Result<T,E>
  }
}

// ❌ Don't use try-catch in pure workflows
function badWorkflow2(data: unknown): Result<Data, Error> {
  try {
    // ❌ Use Result patterns
    return ok(processData(data));
  } catch (error) {
    return err(error);
  }
}
```

### Frontend Anti-Patterns

```typescript
// ❌ Don't ignore loading states
const handleClick = async () => {
  const result = await action(); // ❌ No loading indication
  // handle result
};

// ❌ Don't forget error cleanup
const [error, setError] = useState<string | null>(null);
const handleAction = async () => {
  // setError(null); // ❌ Forgot to clear previous errors
  const result = await action();
};
```

## Related Documentation

- [Backend](./backend.md#domain-error-system) - Backend-specific error patterns
- [Frontend](./frontend.md#client-side-error-handling) - Frontend error handling
- [Architecture](./architecture.md) - Overall architectural principles

---

_Last Updated: 2025-06-26_
