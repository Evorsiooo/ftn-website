-- Studio: a host-set volume per person on air (1 = as levelled), applied in that person's
-- browser before their voice goes out, so every listener (and the replay) hears the change.
ALTER TABLE `radio_studio_people` ADD `gain` real DEFAULT 1 NOT NULL;
