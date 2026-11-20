import {
  IconArrowDown as TablerArrowDown,
  IconArrowLeft as TablerArrowLeft,
  IconArrowRight as TablerArrowRight,
  IconArrowUp as TablerArrowUp,
  IconAt,
  IconBell as TablerBell,
  IconBold as TablerBold,
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconCashBanknote,
  IconChartBar,
  IconCheck as TablerCheck,
  IconCheckbox,
  IconChevronDown as TablerChevronDown,
  IconChevronLeft as TablerChevronLeft,
  IconChevronRight as TablerChevronRight,
  IconColumns as TablerColumns,
  IconCreditCard,
  IconDatabase,
  IconDeviceDesktop,
  IconDownload as TablerDownload,
  IconFileDescription,
  IconFileInvoice,
  IconFileText,
  IconFilter as TablerFilter,
  IconForms,
  IconH2,
  IconHelpCircle,
  IconHome as TablerHome,
  IconInbox,
  IconItalic as TablerItalic,
  IconLayoutKanban,
  IconLink as TablerLink,
  IconList as TablerList,
  IconListCheck,
  IconListNumbers,
  IconLock as TablerLock,
  IconLogout,
  IconMail as TablerMail,
  IconMenu2,
  IconMoon as TablerMoon,
  IconNotes,
  IconPackage,
  IconPaperclip,
  IconPhone as TablerPhone,
  IconPlus as TablerPlus,
  IconRepeat as TablerRepeat,
  IconSearch as TablerSearch,
  IconSettings as TablerSettings,
  IconSparkles,
  IconStar as TablerStar,
  IconStarFilled,
  IconSun as TablerSun,
  IconTargetArrow,
  IconUpload,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconX,
  type Icon as TablerIcon,
  type IconProps as TablerIconProps,
} from '@tabler/icons-react';

type IconProps = Omit<TablerIconProps, 'ref'> & { size?: number };

const STRICH = 1.6;

const aus =
  (Symbol: TablerIcon) =>
  ({ size = 16, ...rest }: IconProps) => (
    <Symbol
      size={size}
      stroke={STRICH}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );

export const IconHome = aus(TablerHome);
export const IconTasks = aus(IconCheckbox);
export const IconCalendar = aus(IconCalendarEvent);
export const IconRepeat = aus(TablerRepeat);
export const IconDeals = aus(IconTargetArrow);
export const IconReports = aus(IconChartBar);
export const IconQuotes = aus(IconFileDescription);
export const IconCompanies = aus(IconBuildingSkyscraper);
export const IconContacts = aus(IconUser);
export const IconGroups = aus(IconUsersGroup);
export const IconImport = aus(IconUpload);
export const IconFields = aus(IconForms);
export const IconTeam = aus(IconUsers);
export const IconBilling = aus(IconCreditCard);
export const IconData = aus(IconDatabase);
export const IconLetterhead = aus(IconFileText);
export const IconInvoices = aus(IconFileInvoice);
export const IconOpenItems = aus(IconCashBanknote);
export const IconMailbox = aus(IconInbox);
export const IconDownload = aus(TablerDownload);
export const IconProducts = aus(IconPackage);
export const IconCheck = aus(TablerCheck);
export const IconSuggestions = aus(IconSparkles);
export const IconNote = aus(IconNotes);
export const IconColumns = aus(TablerColumns);
export const IconSearch = aus(TablerSearch);
export const IconSun = aus(TablerSun);
export const IconMoon = aus(TablerMoon);
export const IconMonitor = aus(IconDeviceDesktop);
export const IconLogOut = aus(IconLogout);
export const IconPlus = aus(TablerPlus);
export const IconMail = aus(TablerMail);
export const IconPhone = aus(TablerPhone);
export const IconChevronDown = aus(TablerChevronDown);
export const IconBoard = aus(IconLayoutKanban);
export const IconList = aus(TablerList);
export const IconBell = aus(TablerBell);
export const IconSettings = aus(TablerSettings);
export const IconMenu = aus(IconMenu2);
export const IconHelp = aus(IconHelpCircle);
export const IconFilter = aus(TablerFilter);
export const IconClose = aus(IconX);
export const IconAttachment = aus(IconPaperclip);
export const IconLink = aus(TablerLink);
export const IconLock = aus(TablerLock);
export const IconBold = aus(TablerBold);
export const IconItalic = aus(TablerItalic);
export const IconHeading = aus(IconH2);
export const IconNumberedList = aus(IconListNumbers);
export const IconChecklist = aus(IconListCheck);
export const IconMention = aus(IconAt);
export const IconChevronLeft = aus(TablerChevronLeft);
export const IconChevronRight = aus(TablerChevronRight);
export const IconArrowLeft = aus(TablerArrowLeft);
export const IconArrowRight = aus(TablerArrowRight);
export const IconArrowUp = aus(TablerArrowUp);
export const IconArrowDown = aus(TablerArrowDown);

const SternLeer = aus(TablerStar);
const SternVoll = aus(IconStarFilled);

export const IconStar = ({
  filled = false,
  ...p
}: IconProps & { filled?: boolean }) =>
  filled ? <SternVoll {...p} /> : <SternLeer {...p} />;
