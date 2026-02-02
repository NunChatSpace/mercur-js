import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260202173051 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "oauth_refresh_token" drop constraint if exists "oauth_refresh_token_token_unique";`);
    this.addSql(`alter table if exists "oauth_access_token" drop constraint if exists "oauth_access_token_token_unique";`);
    this.addSql(`alter table if exists "oauth_authorization_code" drop constraint if exists "oauth_authorization_code_code_unique";`);
    this.addSql(`alter table if exists "oauth_client" drop constraint if exists "oauth_client_client_id_unique";`);
    this.addSql(`create table if not exists "oauth_client" ("id" text not null, "client_id" text not null, "client_secret" text not null, "name" text not null, "redirect_uris" jsonb not null, "grants" jsonb not null, "scopes" text[] not null, "revoked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oauth_client_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_oauth_client_client_id_unique" ON "oauth_client" ("client_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_client_deleted_at" ON "oauth_client" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "oauth_authorization_code" ("id" text not null, "code" text not null, "client_id" text not null, "user_id" text not null, "user_type" text not null, "redirect_uri" text not null, "scope" text null, "state" text null, "expires_at" timestamptz not null, "revoked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oauth_authorization_code_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_oauth_authorization_code_code_unique" ON "oauth_authorization_code" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_authorization_code_client_id" ON "oauth_authorization_code" ("client_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_authorization_code_deleted_at" ON "oauth_authorization_code" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "oauth_access_token" ("id" text not null, "token" text not null, "client_id" text not null, "user_id" text not null, "user_type" text not null, "scope" text null, "expires_at" timestamptz not null, "revoked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oauth_access_token_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_oauth_access_token_token_unique" ON "oauth_access_token" ("token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_access_token_client_id" ON "oauth_access_token" ("client_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_access_token_deleted_at" ON "oauth_access_token" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "oauth_refresh_token" ("id" text not null, "token" text not null, "client_id" text not null, "user_id" text not null, "user_type" text not null, "scope" text null, "expires_at" timestamptz not null, "revoked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oauth_refresh_token_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_oauth_refresh_token_token_unique" ON "oauth_refresh_token" ("token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_refresh_token_client_id" ON "oauth_refresh_token" ("client_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oauth_refresh_token_deleted_at" ON "oauth_refresh_token" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "oauth_authorization_code" add constraint "oauth_authorization_code_client_id_foreign" foreign key ("client_id") references "oauth_client" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "oauth_access_token" add constraint "oauth_access_token_client_id_foreign" foreign key ("client_id") references "oauth_client" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "oauth_refresh_token" add constraint "oauth_refresh_token_client_id_foreign" foreign key ("client_id") references "oauth_client" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "oauth_authorization_code" drop constraint if exists "oauth_authorization_code_client_id_foreign";`);

    this.addSql(`alter table if exists "oauth_access_token" drop constraint if exists "oauth_access_token_client_id_foreign";`);

    this.addSql(`alter table if exists "oauth_refresh_token" drop constraint if exists "oauth_refresh_token_client_id_foreign";`);

    this.addSql(`drop table if exists "oauth_client" cascade;`);

    this.addSql(`drop table if exists "oauth_authorization_code" cascade;`);

    this.addSql(`drop table if exists "oauth_access_token" cascade;`);

    this.addSql(`drop table if exists "oauth_refresh_token" cascade;`);
  }

}
