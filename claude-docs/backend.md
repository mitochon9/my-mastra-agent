# Backend Implementation Patterns

## Overview

This document defines backend-specific implementation patterns using Domain Modeling Made Functional (DMMF), Railway Oriented Programming (ROP), and dependency injection patterns.

## Quick Reference

### DMMF Chain Methods

- `chain(input)` - Start chain with input
- `.andThen(fn)` - Sync transformation
- `.asyncAndThen(fn)` - Async transformation
- `.tap(fn)` - Side effects without changing data
- `.mapErr(fn)` - Transform errors
- `.trace(msg)` - Debug logging
- `.toResult()` - Convert to Result<T,E>

## DMMF Workflow Pattern

### Complete Workflow Implementation

```typescript
// ✅ Correct imports
import { chain } from "@kikagaku-buddy/shared/result/chain";
import { ok, err, type Result } from "@kikagaku-buddy/shared/result";

// ✅ Complete workflow with all chain methods
export function createChatWorkflow(
  deps: ChatDeps
): Workflow<Command, Event, Error> {
  return async (command: Command) => {
    return chain<Input, WorkflowError>(command.input)
      .trace("Workflow started") // debug logging
      .andThen(validateInput) // sync validation
      .tap((data) => logActivity(data)) // side effects
      .asyncAndThen(persistData(deps)) // async persistence
      .mapErr(transformDomainError) // error transformation
      .andThen(createEvent) // sync event creation
      .trace("Workflow completed")
      .toResult(); // Result<Event, Error>
  };
}

// ✅ Dependency injection pattern
type ChatDeps = {
  createChat: (
    data: ChatData,
    db: PrismaClient
  ) => Promise<Result<Chat, RepositoryError>>;
  logActivity: (data: unknown) => void;
  db: PrismaClient;
};
```

### Workflow Implementation Style

```typescript
// ✅ Helper functions only - no inline functions in chains
function validateCommand(
  cmd: Command
): Result<ValidatedCommand, ValidationError> {}
function checkBusinessRule(deps: Deps) {
  return async (
    data: ValidatedCommand
  ): Promise<Result<DataWithContext, Error>> => {};
}

// ✅ Workflow pattern
export function createWorkflow(deps: Deps): Workflow<Command, Event, Error> {
  return async (command: Command) => {
    return chain(command)
      .andThen(validateCommand) // Named function only
      .asyncAndThen(checkBusinessRule(deps)) // No inline arrows/functions
      .andThen(createEvent)
      .toResult(); // Returns Result<Event, Error>
  };
}
```

## Backend Architecture Layers

| Layer              | Error Handling Pattern | Rationale                                        |
| ------------------ | ---------------------- | ------------------------------------------------ |
| **HTTP Routes**    | try-catch allowed      | Boundary layer, prevents server crashes          |
| **Workflows**      | Result<T,E> only       | Pure functional domain logic, no exceptions      |
| **Repositories**   | Result<T,E> return     | Internal try-catch for DB errors, returns Result |
| **Infrastructure** | Result<T,E> return     | External service integration, returns Result     |

### Route Handler Pattern

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

### Repository Pattern

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

## Domain Error System

```typescript
// ✅ Structured error hierarchy
import {
  validationError,
  notFoundError,
  businessRuleViolationError,
  repositoryError,
  type ValidationError,
  type NotFoundError,
  type RepositoryError,
} from "@kikagaku-buddy/shared/errors";

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
```

## Value Objects & Organization Support

```typescript
// ✅ Type-safe ID generation
import {
  UserId,
  ChatId,
  OrganizationId,
  createUserId,
  createChatId,
  createOrganizationId,
  generateNewUserId,
  generateNewChatId,
} from "@kikagaku-buddy/shared/value-objects";

// ✅ Multi-tenant workflow patterns
type OrganizationCommand = {
  organizationId: OrganizationId;
  userId: UserId;
  data: CommandData;
};

function validateOrganizationAccess(
  cmd: OrganizationCommand
): Result<ValidatedCommand, BusinessRuleViolationError> {
  // Organization-level validation logic
}
```

## Workflow Dependencies

```typescript
// ✅ Explicit dependency typing
type WorkflowDeps = {
  findUser: (id: UserId, db: DB) => Promise<Result<User, RepositoryError>>;
  saveEvent: (event: Event, db: DB) => Promise<Result<void, RepositoryError>>;
  validateOrganization: (
    orgId: OrganizationId
  ) => Promise<Result<void, ValidationError>>;
  db: PrismaClient;
};
```

## Related Documentation

- [Architecture](./architecture.md#dmmf-backend) - Core architecture principles
- [Error Handling](./error-handling.md) - Comprehensive error management
- [Testing](./testing.md#backend) - Backend testing patterns

---

_Last Updated: 2025-06-26_
