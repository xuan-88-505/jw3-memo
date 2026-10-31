CREATE TABLE `device_tokens` (
	`id` varchar(32) NOT NULL,
	`memberId` varchar(32) NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`platform` enum('win','mac') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `device_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`teamId` varchar(32) NOT NULL,
	`kind` enum('scheme','character','raidLog','blacklist','link','loadout','note') NOT NULL,
	`entityId` varchar(96) NOT NULL,
	`ownerId` varchar(32) NOT NULL,
	`visibility` enum('team','private') NOT NULL,
	`version` int NOT NULL,
	`data` mediumtext NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`seq` bigint NOT NULL,
	`updatedBy` varchar(32) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entities_team_kind_entity_unique` UNIQUE(`teamId`,`kind`,`entityId`)
);
--> statement-breakpoint
CREATE TABLE `login_codes` (
	`id` varchar(32) NOT NULL,
	`memberId` varchar(32) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` varchar(32) NOT NULL,
	`teamId` varchar(32) NOT NULL,
	`nickname` varchar(48) NOT NULL,
	`nicknameKey` varchar(48) NOT NULL,
	`role` enum('admin','editor','viewer') NOT NULL,
	`color` varchar(32) NOT NULL,
	`avatar` json,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`removedAt` timestamp,
	CONSTRAINT `members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_files` (
	`id` varchar(32) NOT NULL,
	`teamId` varchar(32) NOT NULL,
	`memberId` varchar(32) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mime` varchar(64) NOT NULL,
	`bytes` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` varchar(32) NOT NULL,
	`name` varchar(80) NOT NULL,
	`inviteCode` varchar(16) NOT NULL,
	`seq` bigint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE INDEX `device_tokens_memberId_idx` ON `device_tokens` (`memberId`);--> statement-breakpoint
CREATE INDEX `entities_team_seq_idx` ON `entities` (`teamId`,`seq`);--> statement-breakpoint
CREATE INDEX `login_codes_memberId_idx` ON `login_codes` (`memberId`);--> statement-breakpoint
CREATE INDEX `login_codes_codeHash_idx` ON `login_codes` (`codeHash`);--> statement-breakpoint
CREATE INDEX `members_teamId_removedAt_idx` ON `members` (`teamId`,`removedAt`);--> statement-breakpoint
CREATE INDEX `members_teamId_nicknameKey_idx` ON `members` (`teamId`,`nicknameKey`);--> statement-breakpoint
CREATE INDEX `team_files_teamId_idx` ON `team_files` (`teamId`);--> statement-breakpoint
CREATE INDEX `team_files_memberId_createdAt_idx` ON `team_files` (`memberId`,`createdAt`);