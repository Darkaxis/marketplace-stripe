import {
  Car,
  Home,
  Shirt,
  Tag,
  Smartphone,
  Film,
  Heart,
  Gift,
  Sprout,
  Palette,
  Sofa,
  Wrench,
  KeyRound,
  Music,
  Briefcase,
  PawPrint,
  Trophy,
  Gamepad2,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface CategoryItem {
  name: string;
  slug: string;
  icon: LucideIcon;
  description: string;
}

export const CATEGORIES: CategoryItem[] = [
  {
    name: "Vehicles",
    slug: "vehicles",
    icon: Car,
    description: "Cars, trucks, motorcycles, and EVs near you",
  },
  {
    name: "Property Rentals",
    slug: "property-rentals",
    icon: Home,
    description: "Apartments, houses, and rooms for rent",
  },
  {
    name: "Apparel",
    slug: "apparel",
    icon: Shirt,
    description: "Men's, women's, and kids' clothing, shoes, and accessories",
  },
  {
    name: "Classifieds",
    slug: "classifieds",
    icon: Tag,
    description: "Local classified ads, garage sales, and community listings",
  },
  {
    name: "Electronics",
    slug: "electronics",
    icon: Smartphone,
    description: "Computers, phones, cameras, audio gear, and tech accessories",
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: Film,
    description: "Video games, consoles, movies, books, and media",
  },
  {
    name: "Family",
    slug: "family",
    icon: Heart,
    description: "Baby gear, strollers, kids' furniture, and family essentials",
  },
  {
    name: "Free Stuff",
    slug: "free-stuff",
    icon: Gift,
    description: "Free items shared by neighbors in your local community",
  },
  {
    name: "Garden & Outdoor",
    slug: "garden-outdoor",
    icon: Sprout,
    description: "Patio furniture, plants, lawn equipment, and outdoor gear",
  },
  {
    name: "Hobbies",
    slug: "hobbies",
    icon: Palette,
    description: "Arts & crafts, collectibles, photography, and DIY supplies",
  },
  {
    name: "Home Goods",
    slug: "home-goods",
    icon: Sofa,
    description: "Furniture, decor, kitchen appliances, and home essentials",
  },
  {
    name: "Home Improvement",
    slug: "home-improvement",
    icon: Wrench,
    description: "Power tools, hardware, fixtures, and building materials",
  },
  {
    name: "Home Sales",
    slug: "home-sales",
    icon: KeyRound,
    description: "Homes, condos, and townhomes for sale",
  },
  {
    name: "Musical Instruments",
    slug: "musical-instruments",
    icon: Music,
    description: "Guitars, keyboards, drums, studio gear, and amplifiers",
  },
  {
    name: "Office Supplies",
    slug: "office-supplies",
    icon: Briefcase,
    description: "Desks, ergonomic chairs, monitors, and office equipment",
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    icon: PawPrint,
    description: "Pet beds, carriers, aquariums, and accessories",
  },
  {
    name: "Sporting Goods",
    slug: "sporting-goods",
    icon: Trophy,
    description: "Bicycles, fitness equipment, camping gear, and outdoor sports",
  },
  {
    name: "Toys & Games",
    slug: "toys-games",
    icon: Gamepad2,
    description: "Board games, LEGO sets, puzzles, and action figures",
  },
  {
    name: "Buy and sell groups",
    slug: "buy-and-sell-groups",
    icon: Users,
    description: "Local neighborhood buy, sell, and trade community groups",
  },
];

export function getCategoryBySlug(slug: string): CategoryItem | undefined {
  const normalized = slug.toLowerCase().trim();
  return CATEGORIES.find(
    (c) =>
      c.slug === normalized ||
      c.name.toLowerCase() === normalized
  );
}

export function getCategoryLabel(slugOrName: string): string {
  const found = getCategoryBySlug(slugOrName);
  if (found) return found.name;
  return slugOrName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
