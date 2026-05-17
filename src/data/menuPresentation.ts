const MENU_DISPLAY_LABELS: Record<string, string> = {
  pdfprintlabel: 'Price Labels',
  stockserialitemresearch: 'Serial Research',
  stockmovements: 'Stock Moves',
  stockstatus: 'Stock Status',
  stockusage: 'Stock Usage',
  allstockusage: 'All Usage',
  inventoryquantities: 'Quantities',
  reorderlevel: 'Reorder Levels',
  reorderlevellocation: 'Loc Reorder',
  stockdispatch: 'Dispatch',
  inventoryvaluation: 'Valuation',
  inventoryplanning: 'Planning',
  inventoryplanningprefsupplier: 'Supplier Plan',
  stockcheck: 'Check Sheets',
  stockqtiescsv: 'Qty CSV',
  pdfstockcheckcomparison: 'Count Compare',
  stocklocmovements: 'Loc Movements',
  stocklocstatus: 'Loc Status',
  stockquantitybydate: 'Qty by Date',
  pdfstocknegatives: 'Negative Stock',
  pdfstocktranslisting: 'Stock Txns',
  selectproduct: 'Inventory Items',
  stocks: 'Inventory Items',
  pricesbasedonmarkup: 'Cost-Based Prices',
  pricesbycost: 'Cost-Based Prices',
  salescategories: 'Sales Categories',
  locationusers: 'Location Users',
  userlocations: 'User Locations',
  departments: 'Departments',
  internalstockcategoriesbyrole: 'Category Roles',
  labels: 'Label Templates',
  mrpcalendar: 'MRP Calendar',
  mrpdemandtypes: 'MRP Demand Types',
};

function normalizedMenuKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hrefKey(href = ''): string {
  const normalizedHref = href.replace(/&amp;/gi, '&').trim();
  const withoutQuery = normalizedHref.split('?')[0];
  const filename = withoutQuery.split('/').pop() ?? '';
  return normalizedMenuKey(filename.replace(/\.php$/i, ''));
}

export function menuDisplayCaption(caption: string, href = ''): string {
  const key = hrefKey(href);
  return MENU_DISPLAY_LABELS[key] ?? caption;
}
