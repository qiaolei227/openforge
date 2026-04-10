export class BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly orgId: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

export class UserCreatedEvent extends BaseEvent {
  constructor(
    public readonly data: { id: string; username: string },
    userId: string,
    orgId: string,
  ) {
    super(userId, orgId);
  }
}

export class UserUpdatedEvent extends BaseEvent {
  constructor(
    public readonly data: { id: string; changes: Record<string, any> },
    userId: string,
    orgId: string,
  ) {
    super(userId, orgId);
  }
}

export class OrgCreatedEvent extends BaseEvent {
  constructor(
    public readonly data: { id: string; code: string },
    userId: string,
    orgId: string,
  ) {
    super(userId, orgId);
  }
}

export class ModelCreatedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { id: string; tableName: string },
  ) {
    super(userId, orgId);
  }
}

export class ModelDeletedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { id: string; tableName: string },
  ) {
    super(userId, orgId);
  }
}

export class FieldCreatedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { id: string; modelId: string; columnName: string },
  ) {
    super(userId, orgId);
  }
}

export class FieldDeletedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { id: string; modelId: string; columnName: string },
  ) {
    super(userId, orgId);
  }
}

export class RecordCreatedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { modelCode: string; recordId: string },
  ) {
    super(userId, orgId);
  }
}

export class RecordUpdatedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { modelCode: string; recordId: string },
  ) {
    super(userId, orgId);
  }
}

export class RecordDeletedEvent extends BaseEvent {
  constructor(
    userId: string,
    orgId: string,
    public data: { modelCode: string; recordId: string },
  ) {
    super(userId, orgId);
  }
}
