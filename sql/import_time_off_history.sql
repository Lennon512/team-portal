-- Time off HISTORY import from the Google Form ("Request Time Off (Responses)"): every request, past and upcoming.
-- Use this one file instead of import_time_off_2026-11-18.sql (it already includes those upcoming requests).
-- All are added as APPROVED so they count in the By person summary.
-- People are matched to portal accounts by email first, then by name.
-- Skipped: anything that overlaps a request already in the portal for the same person (so nothing doubles up),
--   and 4 form lines: row 27: test entry; row 39: duplicate of the line above with a typo (July 25-June 1); row 40: no dates were entered; row 42: same request sent twice.
-- Needs sql/time_off_deleted.sql to have been run first (so deleted requests stay deleted).
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. The result lists anyone it could NOT match
--   (usually people who no longer work here and don't have a portal account).

drop table if exists tor_import, tor_matched;
create temp table tor_import (emails text[], names text[], start_date date, end_date date, shift_type text, can_cover text, coverage text, coverage_note text, note text);

insert into tor_import values
  -- Alyssa Standley: June 11-15
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-06-11', '2026-06-15', 'full', 'no', 'no', null, 'Request is for Four Points and Lakeway. Reason is for travel/personal. Was approved by James.'),
  -- Alyssa Standley: June 5th (6/5/26)
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-06-05', '2026-06-05', 'full', 'no', 'no', null, 'Personal'),
  -- Alyssa Standley: June 6th
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-06-06', '2026-06-06', 'full', 'no', 'other', 'Peyton works, and we had been working every other Saturday and coverage has always been 1 person typically.', 'Personal - family coming in from out of town + plans.'),
  -- Alyssa Standley: 7/25
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-07-25', '2026-07-25', 'full', 'no', 'no', null, 'Personal, will be out of town'),
  -- Alyssa Standley: 8/15
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-08-15', '2026-08-15', 'full', 'yes', 'no', null, 'Out of town for a wedding'),
  -- Alyssa Standley: 9/4 & 9/5
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-09-04', '2026-09-05', 'full', 'yes', 'other', 'Peyton & Charles will be in studio. I can cover Monday 8/31 if needed.', 'Will be out of town/state'),
  -- Ryen Browning: May 15th
  ('{"browningryen@gmail.com"}', '{"Ryen Browning"}', '2026-05-15', '2026-05-15', 'partial', 'yes', 'no', null, 'Graduation walk through/ Robe distribution'),
  -- Brynn Elzerman: July 24-25th
  ('{"brynn.elzer@icloud.com"}', '{"Brynn Elzerman"}', '2026-07-24', '2026-07-25', 'full', 'maybe', 'no', null, 'Last-minute surprise birthday trip!'),
  -- Brynn Elzerman: Monday September 14th (I am available to work 9-3)
  ('{"brynn.elzer@icloud.com"}', '{"Brynn Elzerman"}', '2026-09-14', '2026-09-14', 'partial', 'maybe', 'no', null, 'I have an event to go to!'),
  -- Brynn Elzerman: Oct 5-9th
  ('{"brynn.elzer@icloud.com"}', '{"Brynn Elzerman"}', '2026-10-05', '2026-10-09', 'full', 'no', 'no', null, 'Going to hackathon'),
  -- Diana Combs: August 6- August 10th
  ('{"dianafcombs@gmail.com"}', '{"Diana Combs"}', '2026-08-06', '2026-08-10', 'full', 'maybe', 'no', null, 'traveling for wedding'),
  -- Diana Recalde: 8/25-9/1
  ('{"dmrecalde@gmail.com"}', '{"Diana Recalde"}', '2026-08-25', '2026-09-01', 'full', 'no', 'no', null, 'Trip to CA'),
  -- Diana Recalde: Oct 23-26 Nov 18-23 Dec 22-Jan 4
  ('{"dmrecalde@gmail.com"}', '{"Diana Recalde"}', '2026-10-23', '2026-10-26', 'full', 'maybe', 'other', 'Maybe', 'Birthdays and Holidays'),
  ('{"dmrecalde@gmail.com"}', '{"Diana Recalde"}', '2026-11-18', '2026-11-23', 'full', 'maybe', 'other', 'Maybe', 'Birthdays and Holidays'),
  ('{"dmrecalde@gmail.com"}', '{"Diana Recalde"}', '2026-12-22', '2027-01-04', 'full', 'maybe', 'other', 'Maybe', 'Birthdays and Holidays'),
  -- Dorothy Marie Elemento: September 23rd-26th
  ('{"dorothyelemento@gmail.com"}', '{"Dorothy Marie Elemento","Dorothy Elemento"}', '2026-09-23', '2026-09-26', 'full', 'maybe', 'no', null, 'Wedding'),
  -- Dorothy Marie Elemento: 10/10
  ('{"dorothyelemento@gmail.com"}', '{"Dorothy Marie Elemento","Dorothy Elemento"}', '2026-10-10', '2026-10-10', 'partial', 'maybe', 'no', null, 'Personal'),
  -- Dorothy Marie Elemento: 10/14/2026
  ('{"dorothyelemento@gmail.com"}', '{"Dorothy Marie Elemento","Dorothy Elemento"}', '2026-10-14', '2026-10-14', 'partial', 'no', 'no', null, 'Leave an hour early. Personal'),
  -- Peyton Farrow: May 1, 2, 15, 28, 29. June 18-22, 29th-July 2nd
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-05-01', '2026-05-02', 'full', 'maybe', 'yes', null, 'Siblings graduations in May, family trip in June, Baylor orientation end of June into July!'),
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-05-15', '2026-05-15', 'full', 'maybe', 'yes', null, 'Siblings graduations in May, family trip in June, Baylor orientation end of June into July!'),
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-05-28', '2026-05-29', 'full', 'maybe', 'yes', null, 'Siblings graduations in May, family trip in June, Baylor orientation end of June into July!'),
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-06-18', '2026-06-22', 'full', 'maybe', 'yes', null, 'Siblings graduations in May, family trip in June, Baylor orientation end of June into July!'),
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-06-29', '2026-07-02', 'full', 'maybe', 'yes', null, 'Siblings graduations in May, family trip in June, Baylor orientation end of June into July!'),
  -- Peyton Farrow: June 13th
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-06-13', '2026-06-13', 'full', 'yes', 'no', null, 'Grandparent''s 50th anniversary'),
  -- Peyton Farrow: July 24th
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-07-24', '2026-07-24', 'full', 'no', 'no', null, 'Family Beach Trip/Sister''s Birthday'),
  -- Peyton Farrow: August 26-28th, 2026
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-08-26', '2026-08-28', 'full', 'yes', 'no', null, 'Break from school/Trip to Big Bend'),
  -- Peyton Farrow: October 23rd
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-10-23', '2026-10-23', 'full', 'no', 'no', null, 'Coming back from lab and my birthday, so I was wanting to go to the lake.'),
  -- Gabriel Casteel: Friday May 22nd
  ('{"golfcharlie0@gmail.com"}', '{"Gabriel Casteel","Gabe Casteel"}', '2026-05-22', '2026-05-22', 'full', 'no', 'no', null, 'Heading out of town'),
  -- Gabriel Casteel: July 6th and 7th
  ('{"golfcharlie0@gmail.com"}', '{"Gabriel Casteel","Gabe Casteel"}', '2026-07-06', '2026-07-07', 'full', 'no', 'no', null, 'Will be at a wedding those days'),
  -- Gabriel Casteel: October 8-14
  ('{"golfcharlie0@gmail.com"}', '{"Gabriel Casteel","Gabe Casteel"}', '2026-10-08', '2026-10-14', 'full', 'no', 'no', null, 'Heading out of town for vacation'),
  -- Ian Schmidt: June 2nd and 3rd
  ('{"ianofflimits@gamil.com","ianofflimits@gmail.com"}', '{"Ian Schmidt"}', '2026-06-02', '2026-06-03', 'full', 'maybe', 'no', null, 'Personal time off'),
  -- Lea Blinder: august 26th - september 1st
  ('{"lhblinder@gmail.com"}', '{"Lea Blinder","Lea Haylie Blinder"}', '2026-08-26', '2026-09-01', 'full', 'yes', 'no', null, 'sisters wedding'),
  -- Lea Blinder: July 8th
  ('{"lhblinder@gmail.com"}', '{"Lea Blinder","Lea Haylie Blinder"}', '2026-07-08', '2026-07-08', 'full', 'yes', 'yes', null, 'Birthday'),
  -- Lea Blinder: September 19th
  ('{"lhblinder@gmail.com"}', '{"Lea Blinder","Lea Haylie Blinder"}', '2026-09-19', '2026-09-19', 'full', 'yes', 'other', 'I can if you would like', 'Holiday party'),
  -- Michael Williams: May 14th-17th
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-05-14', '2026-05-17', 'full', 'maybe', 'yes', null, 'Family member graduation'),
  -- Michael Williams: April 18th
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-04-18', '2026-04-18', 'full', 'no', 'yes', null, 'Funeral'),
  -- Michael Williams: December 19th-27th
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-12-19', '2026-12-27', 'full', 'no', 'no', null, 'Christmas trip'),
  -- Michael Williams: 05/30/26
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-05-30', '2026-05-30', 'full', 'maybe', 'yes', null, 'Family memorial'),
  -- Michael Williams: 06/19/2026
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-06-19', '2026-06-19', 'full', 'maybe', 'yes', null, 'Juneteenth'),
  -- Michael Williams: July 16th-19th July 24th and 27th
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-07-16', '2026-07-19', 'full', 'maybe', 'yes', null, 'Gender reveal/ family reunion'),
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-07-24', '2026-07-24', 'full', 'maybe', 'yes', null, 'Gender reveal/ family reunion'),
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-07-27', '2026-07-27', 'full', 'maybe', 'yes', null, 'Gender reveal/ family reunion'),
  -- Michael Williams: 6/2/26
  ('{"mcwilliams0205@gmail.com"}', '{"Michael Williams"}', '2026-06-02', '2026-06-02', 'partial', 'no', 'yes', null, 'Touring town home'),
  -- Mia Zaia: July 25-August 1
  ('{"mia.zaia08@gmail.com"}', '{"Mia Zaia"}', '2026-07-25', '2026-08-01', 'full', 'yes', 'yes', null, 'Going to Connecticut to see my grandma'),
  -- Mia Zaia: October 9th
  ('{"mia.zaia08@gmail.com"}', '{"Mia Zaia"}', '2026-10-09', '2026-10-09', 'full', 'no', 'other', 'There’s enough people in the studio we should be good', 'Feeling burnt out, need a reset day'),
  -- Michaela Myers: 09/04-09/07
  ('{"miclovesdance@gmail.com"}', '{"Michaela Myers"}', '2026-09-04', '2026-09-07', 'full', 'no', 'no', null, 'going out of town'),
  -- Nicholas Villarreal: June 21- July 9th
  ('{"nicholas.s.villarreal@gmail.com"}', '{"Nicholas Villarreal"}', '2026-06-21', '2026-07-09', 'full', 'no', 'no', null, 'Family vacation to Africa'),
  -- Nicholas Villarreal: 6/18/26
  ('{"nicholas.s.villarreal@gmail.com"}', '{"Nicholas Villarreal"}', '2026-06-18', '2026-06-18', 'full', 'yes', 'yes', null, 'other'),
  -- Preston Futrell: April 17th - April 18th
  ('{"prestonfutrell7@gmail.com"}', '{"Preston Futrell"}', '2026-04-17', '2026-04-18', 'full', 'yes', 'yes', null, 'Traveling out of town'),
  -- Preston Futrell: November 12th - 16th
  ('{"prestonfutrell7@gmail.com"}', '{"Preston Futrell"}', '2026-11-12', '2026-11-16', 'full', 'yes', 'other', 'Not yet, but will plan accordingly', 'Traveling out of town for a convention'),
  -- Rachel Taylor: 6/5
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-06-05', '2026-06-05', 'full', 'no', 'no', null, 'Family vacation'),
  -- Rachel Taylor: 6/10-6/15
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-06-10', '2026-06-15', 'full', 'no', 'no', null, 'Family trip/sister''s wedding'),
  -- Rachel Taylor: July 13-17
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-07-13', '2026-07-17', 'full', 'maybe', 'no', null, 'Trip to Banff'),
  -- Rachel Taylor: Dec 22-Jan3
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-12-22', '2027-01-03', 'full', 'no', 'no', null, 'vacation'),
  -- Rachel Taylor: 8/24
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-08-24', '2026-08-24', 'full', 'no', 'no', null, 'OOT'),
  -- Rachel Taylor: 10/13/20206
  ('{"rtelaine111@gmail.com"}', '{"Rachel Taylor"}', '2026-10-13', '2026-10-13', 'partial', 'maybe', 'no', null, 'need morning off'),
  -- Guadalupe Torres: 6/10/26
  ('{"torresg1517@student.elms.edu"}', '{"Guadalupe Torres"}', '2026-06-10', '2026-06-10', 'partial', 'yes', 'no', null, 'Doctors appointment for grandma'),
  -- Trevor Watson: 09/7/2026 - 09/11/2026
  ('{"trevor3077@gmail.com"}', '{"Trevor Watson"}', '2026-09-07', '2026-09-11', 'full', 'maybe', 'no', null, 'Family'),
  -- Trevor Watson: 09/28/20206 - 10/01/2026
  ('{"trevor3077@gmail.com"}', '{"Trevor Watson","Trevor A Watson"}', '2026-09-28', '2026-10-01', 'full', 'maybe', 'no', null, 'training for new part time job'),
  -- Tyler Melancon: August 6th - August 10th
  ('{"tylermelancon12@gmail.com"}', '{"Tyler Melancon"}', '2026-08-06', '2026-08-10', 'full', 'no', 'no', null, 'Vacation'),
  -- Tyler Melancon: 9/15-9/26
  ('{"tylermelancon12@gmail.com"}', '{"Tyler Melancon"}', '2026-09-15', '2026-09-26', 'full', 'no', 'no', null, 'Time off'),
  -- Mikey Vargas: 9/9-9/11
  ('{"vargasmike8830@gmail.com"}', '{"Mikey Vargas","Michael Vargas"}', '2026-09-09', '2026-09-11', 'full', 'yes', 'no', null, 'Going home for best friends birthday'),
  -- Brian Wright: May 23rd & May 30th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-05-23', '2026-05-23', 'full', 'maybe', 'other', 'I am unaware of who is available on Saturdays at Westlake besides myself', 'May 23rd is a personal reason & May 30th I have a rugby event'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-05-30', '2026-05-30', 'full', 'maybe', 'other', 'I am unaware of who is available on Saturdays at Westlake besides myself', 'May 23rd is a personal reason & May 30th I have a rugby event'),
  -- Brian Wright: June 6th, 17th, 20th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-06-06', '2026-06-06', 'full', 'maybe', 'other', 'I am unaware of who can work saturday’s at westlake besides myself', 'I have rugby games and events on these dates'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-06-17', '2026-06-17', 'full', 'maybe', 'other', 'I am unaware of who can work saturday’s at westlake besides myself', 'I have rugby games and events on these dates'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-06-20', '2026-06-20', 'full', 'maybe', 'other', 'I am unaware of who can work saturday’s at westlake besides myself', 'I have rugby games and events on these dates'),
  -- Brian Wright: July 3rd, 6th, 7th, 8th, 9th, 18th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-07-03', '2026-07-03', 'full', 'maybe', 'yes', null, 'I have Rugby tournaments and will be traveling for said tournaments around texas and surrounding states.'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-07-06', '2026-07-09', 'full', 'maybe', 'yes', null, 'I have Rugby tournaments and will be traveling for said tournaments around texas and surrounding states.'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-07-18', '2026-07-18', 'full', 'maybe', 'yes', null, 'I have Rugby tournaments and will be traveling for said tournaments around texas and surrounding states.'),
  -- Brian Wright: August 7th 8th 28th 29th 31st and September 1st
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-08-07', '2026-08-08', 'full', 'maybe', 'no', null, 'Rugby Tournaments'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-08-28', '2026-08-29', 'full', 'maybe', 'no', null, 'Rugby Tournaments'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-08-31', '2026-09-01', 'full', 'maybe', 'no', null, 'Rugby Tournaments'),
  -- Brian Wright: September 2nd
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-09-02', '2026-09-02', 'full', 'maybe', 'yes', null, 'Rugby travel because we fly back the 2nd and not the 1st per my last TOR'),
  -- Brian Wright: August 15th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-08-15', '2026-08-15', 'full', 'maybe', 'yes', null, 'Rugby Training'),
  -- Brian Wright: October 3rd, 24th, 30th, 31st November 6th, 7th, 9th, 14th, 28th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-10-03', '2026-10-03', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-10-24', '2026-10-24', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-10-30', '2026-10-31', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-06', '2026-11-07', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-09', '2026-11-09', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-14', '2026-11-14', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-28', '2026-11-28', 'full', 'maybe', 'other', 'No one else works mondays but me at Westlake', 'Rugby Games'),
  -- Yadon Tramel: 8/3 - 8/4
  ('{"yadonlt@gmail.com"}', '{"Yadon Tramel"}', '2026-08-03', '2026-08-04', 'full', 'no', 'no', null, 'Mandatory athletics meeting at school'),
  -- Tony Hatch: 05/22/2026
  ('{"yogafit.tony@gmail.com"}', '{"Tony Hatch"}', '2026-05-22', '2026-05-22', 'full', 'no', 'no', null, 'Emergency reschedule of Surgery'),
  -- Peyton Farrow: November 27th
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Going home for thanksgiving with family'),
  -- Alyssa Standley: 11/6 & 11/7
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-11-06', '2026-11-07', 'full', 'yes', 'other', 'Have coverage Saturday but could use coverage help Friday', 'Out of state/personal'),
  -- Dylan Thamsorn: Dec 10th 2026 - Dec 18th 2026
  ('{"dthamsorn@gmail.com"}', '{"Dylan Thamsorn"}', '2026-12-10', '2026-12-18', 'full', 'yes', 'no', null, 'Birthday Trip to California'),
  -- Lea Blinder: Saturday nov 7
  ('{"lhblinder@gmail.com"}', '{"Lea Blinder","Lea Haylie Blinder"}', '2026-11-07', '2026-11-07', 'full', 'yes', 'no', null, 'going to den'),
  -- Gabriel Casteel: Wednesday November 25th
  ('{"golfcharlie0@gmail.com"}', '{"Gabriel Casteel","Gabe Casteel"}', '2026-11-25', '2026-11-25', 'full', 'no', 'no', null, 'Going out of town'),
  -- Dorothy Marie Elemento: 12/22-12/31
  ('{"dorothyelemento@gmail.com"}', '{"Dorothy Marie Elemento","Dorothy Elemento"}', '2026-12-22', '2026-12-31', 'full', 'no', 'no', null, 'Personal'),
  -- Dylan Thamsorn: November 27th, 2026
  ('{"dthamsorn@gmail.com"}', '{"Dylan Thamsorn"}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town'),
  -- Lea Blinder: 12/30-1/3
  ('{"lhblinder@gmail.com"}', '{"Lea Blinder","Lea Haylie Blinder"}', '2026-12-30', '2027-01-03', 'full', 'yes', 'no', null, 'out of town'),
  -- Gavin Carlton: Nov 24-28 (Most Important) & Dec 21-26
  ('{"gcarlton2003@gmail.com"}', '{"Gavin Carlton"}', '2026-11-24', '2026-11-28', 'full', 'maybe', 'yes', null, 'Travelling home to see family over holidays.'),
  ('{"gcarlton2003@gmail.com"}', '{"Gavin Carlton"}', '2026-12-21', '2026-12-26', 'full', 'maybe', 'yes', null, 'Travelling home to see family over holidays.'),
  -- Tyler Melancon: November 27th
  ('{"tylermelancon12@gmail.com"}', '{"Tyler Melancon"}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Will be out of town for thanksgiving'),
  -- Brian Wright: November 23rd, 24th, 25th, 27th December 5th, 12th, 19th, 21st, 22nd, 23rd, 24th, 26th
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-23', '2026-11-25', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-11-27', '2026-11-27', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-12-05', '2026-12-05', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-12-12', '2026-12-12', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-12-19', '2026-12-19', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-12-21', '2026-12-24', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  ('{"wrightbeatjr@aol.com"}', '{"Brian Wright"}', '2026-12-26', '2026-12-26', 'full', 'no', 'other', 'only 1 other person works here', 'Dec 5th and 12th are for rugby games. The rest is for personal time to go home for the holiday. November to go see my grandpa'),
  -- Gabriel Casteel: Friday, November 27th
  ('{"golfcharlie0@gmail.com"}', '{"Gabriel Casteel","Gabe Casteel"}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town'),
  -- Peyton Farrow: December 21-25
  ('{"farrowpeyton@yahoo.com"}', '{"Peyton Farrow"}', '2026-12-21', '2026-12-25', 'full', 'no', 'no', null, 'Family Christmas'),
  -- Alyssa Standley: Dec 30th-Jan4th
  ('{"alyssaangel2011@gmail.com"}', '{"Alyssa Standley","Alyssa Stanley"}', '2026-12-30', '2027-01-04', 'full', 'yes', 'other', 'Work in progress/half coverage', 'Will be out of town-personal/holiday'),
  -- Tyler Melancon: 11/27
  ('{"tylermelancon12@gmail.com"}', '{"Tyler Melancon"}', '2026-11-27', '2026-11-27', 'full', 'no', 'no', null, 'Out of town');

create temp table tor_matched as
select t.*, (
  select p.id from public.profiles p
  where lower(p.email) = any (select lower(e) from unnest(t.emails) e)
     or lower(trim(p.full_name)) = any (select lower(n) from unnest(t.names) n)
  order by (lower(p.email) = any (select lower(e) from unnest(t.emails) e)) desc
  limit 1) as user_id
from tor_import t;

-- Same person and overlapping dates already in the portal = already there, skip it
insert into public.time_off_requests (user_id, start_date, end_date, shift_type, can_cover, coverage, coverage_note, note, status, decided_at)
select distinct on (m.user_id, m.start_date, m.end_date) m.user_id, m.start_date, m.end_date, m.shift_type, m.can_cover, m.coverage, m.coverage_note, m.note || ' (from time off form)', 'approved', now()
from tor_matched m
where m.user_id is not null
  and not exists (select 1 from public.time_off_requests r where r.user_id = m.user_id and r.start_date <= m.end_date and r.end_date >= m.start_date)
  -- ...and never bring back a request someone deleted in the portal (sql/time_off_deleted.sql)
  and not exists (select 1 from public.time_off_deleted d where d.user_id = m.user_id and d.start_date = m.start_date and d.end_date = m.end_date);

-- In case the database resets new requests to pending, approve the imported ones
update public.time_off_requests r set status = 'approved', decided_at = coalesce(r.decided_at, now())
from tor_matched m
where r.user_id = m.user_id and r.start_date = m.start_date and r.end_date = m.end_date
  and r.status = 'pending' and r.note like '%(from time off form)';

-- Anyone listed here was NOT added (no portal account with that email or name). Send me the names if any should match someone.
select distinct names[1] as not_matched, emails[1] as form_email from tor_matched where user_id is null
union all
select '✓ Everyone matched', null where not exists (select 1 from tor_matched where user_id is null);
