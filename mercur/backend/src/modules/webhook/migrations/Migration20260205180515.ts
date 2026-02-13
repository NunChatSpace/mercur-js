import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260205180515 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "webhook_registration" ("id" text not null, "platform_id" text not null, "shop_id" text not null, "url" text not null, "event_types" jsonb not null, "secret" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "webhook_registration_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_registration_deleted_at" ON "webhook_registration" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_registration_platform_id_shop_id" ON "webhook_registration" ("platform_id", "shop_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "webhook_delivery" ("id" text not null, "registration_id" text not null, "event_type" text not null, "payload" jsonb not null, "status" text check ("status" in ('pending', 'retrying', 'delivered', 'failed')) not null default 'pending', "attempt_count" integer not null default 0, "max_attempts" integer not null default 3, "next_retry_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "webhook_delivery_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_registration_id" ON "webhook_delivery" ("registration_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_deleted_at" ON "webhook_delivery" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_delivery_status_next_retry_at" ON "webhook_delivery" ("status", "next_retry_at") WHERE deleted_at IS NULL;`);

    this.addSql(`DO $$
BEGIN
  IF to_regclass('public.webhook_delivery') IS NOT NULL
     AND to_regclass('public.webhook_registration') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'webhook_delivery_registration_id_foreign'
     ) THEN
    ALTER TABLE "webhook_delivery"
      ADD CONSTRAINT "webhook_delivery_registration_id_foreign"
      FOREIGN KEY ("registration_id")
      REFERENCES "webhook_registration" ("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "webhook_delivery" drop constraint if exists "webhook_delivery_registration_id_foreign";`);

    this.addSql(`drop table if exists "webhook_registration" cascade;`);

    this.addSql(`drop table if exists "webhook_delivery" cascade;`);
  }

}
