CREATE TABLE `feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('bug','idea','other') NOT NULL,
	`content` text NOT NULL,
	`contact` varchar(60),
	`appVersion` varchar(32) NOT NULL,
	`platform` enum('win','mac','web') NOT NULL,
	`lang` varchar(8) NOT NULL,
	`notified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedback_id` PRIMARY KEY(`id`)
);
