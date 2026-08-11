import type { Entity, EntityId } from './entity.js';

/**
 * Looks an entity up by its identity.
 *
 * The `Entity` bound is the point: a repository deals in objects that carry
 * their own identity. A plain DTO or a bare value does not satisfy it, which is
 * what stops a key-value store from being written as a repository by mistake —
 * use {@link KeyValueStore} for those.
 */
export interface FindsById<
  TEntity extends Entity<TId>,
  TId extends EntityId = string,
> {
  findById(id: TId): Promise<TEntity | null>;
}

/**
 * Stores an entity whole.
 *
 * One argument, because the entity already knows which one it is. A value that
 * needs its key passed alongside it (`save(id, value)`) is not an entity, and
 * belongs in a {@link KeyValueStore}.
 */
export interface Saves<TEntity extends Entity<EntityId>> {
  save(entity: TEntity): Promise<void>;
}

/** Removes an entity by its identity. */
export interface Removes<TId extends EntityId = string> {
  remove(id: TId): Promise<void>;
}

/**
 * A collection of entities, addressed by identity — the usual shape, named once.
 *
 * A port extends it and adds the queries its domain actually asks for, in the
 * domain's own language:
 *
 * ```ts
 * export interface OrderRepositoryPort extends Repository<Order> {
 *   findOverdue(): Promise<Order[]>;
 * }
 * ```
 *
 * When a domain must not offer all three operations — an audit log that is
 * written and read but never deleted — compose the parts instead:
 *
 * ```ts
 * export interface AuditLogRepositoryPort
 *   extends FindsById<AuditEntry>, Saves<AuditEntry> {}
 * ```
 */
export interface Repository<
  TEntity extends Entity<TId>,
  TId extends EntityId = string,
>
  extends FindsById<TEntity, TId>, Saves<TEntity>, Removes<TId> {}

/**
 * Values kept under a key the caller supplies — tokens, an encryption key, a
 * cached blob. The mirror image of a repository: there the object carries its
 * identity, here identity lives outside the value entirely.
 *
 * Which one to reach for is decided by the data, not by taste: if the thing
 * stored knows which one it is, it is an entity and belongs in a
 * {@link Repository}; if it needs to be told, it belongs here.
 *
 * A read-only view is `Pick<KeyValueStore<Token>, 'get'>` rather than another
 * named type.
 */
export interface KeyValueStore<TValue, TKey extends string = string> {
  get(key: TKey): Promise<TValue | null>;

  set(key: TKey, value: TValue): Promise<void>;

  remove(key: TKey): Promise<void>;
}
