/**
 * D-Fence — screen id → component.
 * Stereotype: <<boundary>>. Traces: 11.2.1–11.2.26, 11.3.1, 11.3.2.
 *
 * The one place the route table meets the components. `AppShell` renders whatever this returns and
 * knows none of these names, which is what lets a screen be added without editing the shell.
 *
 * **The registry is total, and `screensWithoutComponent` proves it.** A `screenId` in `ROUTES` with
 * no entry here is a route the guard will happily allow and the shell will render as a blank page —
 * a screen the dialog map draws, the router serves, and nobody built. 11.3.1 calls that a promise
 * the software does not keep, and it is exactly the drift that goes unnoticed, because the only
 * symptom is an empty area where content should be.
 */
import { RouteDefinition } from './routes';
import { ScreenProps } from '../screens/ScreenProps';
import { ROUTES } from './routes';

import { LandingScreen } from '../screens/shared/LandingScreen';
import { RegisterScreen } from '../screens/shared/RegisterScreen';
import { SignInScreen } from '../screens/shared/SignInScreen';
import { PasswordResetRequestScreen } from '../screens/shared/PasswordResetRequestScreen';
import { PasswordResetScreen } from '../screens/shared/PasswordResetScreen';
import { NotAuthorisedScreen } from '../screens/shared/NotAuthorisedScreen';
import { NotFoundScreen } from '../screens/shared/NotFoundScreen';

import { ResidentMapScreen } from '../screens/resident/ResidentMapScreen';
import { MyLocationsScreen } from '../screens/resident/MyLocationsScreen';
import { AddLocationScreen } from '../screens/resident/AddLocationScreen';
import { ReportSiteScreen } from '../screens/resident/ReportSiteScreen';
import { MyReportsScreen } from '../screens/resident/MyReportsScreen';
import { ReportDetailScreen } from '../screens/resident/ReportDetailScreen';
import { AlertSettingsScreen } from '../screens/resident/AlertSettingsScreen';

import { OperationsDashboardScreen } from '../screens/operations/OperationsDashboardScreen';
import { ClusterDetailScreen } from '../screens/operations/ClusterDetailScreen';
import { ModerationQueueScreen } from '../screens/operations/ModerationQueueScreen';
import { ReportReviewScreen } from '../screens/operations/ReportReviewScreen';
import { DispatchProposalScreen } from '../screens/operations/DispatchProposalScreen';
import { WorkOrderCreateScreen } from '../screens/operations/WorkOrderCreateScreen';
import { WorkOrderListScreen } from '../screens/operations/WorkOrderListScreen';
import { WorkOrderDetailScreen } from '../screens/operations/WorkOrderDetailScreen';
import { StaffAccountsScreen } from '../screens/operations/StaffAccountsScreen';
import { DataSourcesScreen } from '../screens/operations/DataSourcesScreen';
import { AnalyticsScreen } from '../screens/operations/AnalyticsScreen';

import { MyJobsScreen } from '../screens/crew/MyJobsScreen';
import { JobDetailScreen } from '../screens/crew/JobDetailScreen';
import { JobCompletionScreen } from '../screens/crew/JobCompletionScreen';

export type Screen = (props: ScreenProps) => JSX.Element;

/** Keyed by the PlantUML alias, which is also `RouteDefinition.screenId`. */
export const SCREENS: Record<string, Screen> = {
  Landing: LandingScreen,
  Register: RegisterScreen,
  SignIn: SignInScreen,
  ResetRequest: PasswordResetRequestScreen,
  ResetForm: PasswordResetScreen,
  NotAuthorised: NotAuthorisedScreen,
  NotFound: NotFoundScreen,

  ResidentMap: ResidentMapScreen,
  MyLocations: MyLocationsScreen,
  AddLocation: AddLocationScreen,
  ReportSite: ReportSiteScreen,
  MyReports: MyReportsScreen,
  ReportDetail: ReportDetailScreen,
  AlertSettings: AlertSettingsScreen,

  OpsDashboard: OperationsDashboardScreen,
  ClusterDetail: ClusterDetailScreen,
  ModQueue: ModerationQueueScreen,
  ReportReview: ReportReviewScreen,
  DispatchProposal: DispatchProposalScreen,
  WOCreate: WorkOrderCreateScreen,
  WOList: WorkOrderListScreen,
  WODetail: WorkOrderDetailScreen,
  StaffAccounts: StaffAccountsScreen,
  DataSources: DataSourcesScreen,
  Analytics: AnalyticsScreen,

  MyJobs: MyJobsScreen,
  JobDetail: JobDetailScreen,
  JobCompletion: JobCompletionScreen,
};

/**
 * The `renderScreen` callback `AppShell` expects.
 *
 * An unknown id renders Not Found rather than nothing. That branch should be unreachable —
 * `screensWithoutComponent` fails the build's test suite if it is not — and it still exists,
 * because "unreachable" and "renders a blank page in production" are one refactor apart.
 */
export function renderScreen(
  base: Omit<ScreenProps, 'params'>,
): (route: RouteDefinition, params: Record<string, string>) => JSX.Element {
  return (route, params) => {
    const Component = SCREENS[route.screenId] ?? NotFoundScreen;
    return <Component {...base} params={params} />;
  };
}

/** 11.3.1 — routes the application serves with no component behind them. Empty, or it is a bug. */
export function screensWithoutComponent(): string[] {
  return ROUTES.filter((route) => SCREENS[route.screenId] === undefined).map((route) => route.screenId);
}

/** The mirror: a component registered under an id no route serves — dead code, not a blank page. */
export function componentsWithoutRoute(): string[] {
  const served = new Set(ROUTES.map((route) => route.screenId));
  return Object.keys(SCREENS).filter((id) => !served.has(id));
}
