CREATE TABLE `member_logins` (
	`memberId` varchar(32) NOT NULL,
	`username` varchar(64) NOT NULL,
	`usernameKey` varchar(64) NOT NULL,
	`passwordHash` varchar(200) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_logins_memberId` PRIMARY KEY(`memberId`),
	CONSTRAINT `member_logins_usernameKey_unique` UNIQUE(`usernameKey`)
);
