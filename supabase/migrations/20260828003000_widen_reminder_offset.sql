-- Widens how far from a deadline a relative reminder can sit.
--
-- The original ceiling was 525600 minutes -- one year -- chosen when the UI offered a fixed list
-- topping out at "1 week before". The picker is now a number and a unit, so "90 days after" and
-- "2 years before" are things someone can actually type, and a constraint that rejects them turns
-- a reasonable entry into a failed save.
--
-- Ten years, not unbounded: the column still has to hold a sane duration, and a stray paste of a
-- phone number should be refused somewhere. Ten years is far past any deadline anyone is setting
-- a reminder for, and the client clamps to the same number so nobody meets this constraint.

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_offset_range;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_offset_range
  CHECK (offset_minutes IS NULL OR (offset_minutes BETWEEN 0 AND 5256000));

NOTIFY pgrst, 'reload schema';
