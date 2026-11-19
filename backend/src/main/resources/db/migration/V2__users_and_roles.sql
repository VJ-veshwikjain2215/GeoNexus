-- V2: accounts and roles. No credentials or demo users are seeded.
CREATE TABLE roles
(
    id          smallint PRIMARY KEY,
    name        varchar(32)  NOT NULL,
    description varchar(255) NOT NULL,
    CONSTRAINT uq_roles_name UNIQUE (name),
    CONSTRAINT ck_roles_name_format CHECK (name ~ '^[A-Z][A-Z_]*$')
);

-- Reference data only (least-privilege role catalogue). Permission wiring is a later phase.
INSERT INTO roles (id, name, description)
VALUES (1, 'ADMIN', 'Administers accounts and can read the audit trail'),
       (2, 'SURVEYOR', 'Creates surveys/resurveys and proposes geometry'),
       (3, 'REVIEWER', 'Verifies or rejects proposed geometry and surveys'),
       (4, 'VIEWER', 'Read-only access to parcels the account may see');

CREATE TABLE users
(
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username              varchar(64)  NOT NULL,
    email                 varchar(254) NOT NULL,
    display_name          varchar(120) NOT NULL,
    -- Only a BCrypt/Argon2 hash is ever stored; hashing happens in the auth layer (later phase).
    password_hash         varchar(255) NOT NULL,
    enabled               boolean      NOT NULL DEFAULT true,
    failed_login_attempts integer      NOT NULL DEFAULT 0,
    locked_until          timestamptz,
    last_login_at         timestamptz,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_username_format CHECK (username ~ '^[A-Za-z0-9._-]{3,64}$'),
    CONSTRAINT ck_users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+$'),
    CONSTRAINT ck_users_password_hash_not_blank CHECK (length(password_hash) >= 20),
    CONSTRAINT ck_users_failed_attempts CHECK (failed_login_attempts >= 0)
);
-- Case-insensitive uniqueness without the citext extension.
CREATE UNIQUE INDEX uq_users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION geonexus_touch_updated_at();

CREATE TABLE user_roles
(
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id    smallint    NOT NULL REFERENCES roles (id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES users (id),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX ix_user_roles_role ON user_roles (role_id);
