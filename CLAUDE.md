# Tongues - React Native App Development Guide

## Build Commands
- `yarn start` - Start Metro dev server
- `yarn ios` - Run on iOS simulator
- `yarn android` - Run on Android emulator
- `yarn lint` - Run ESLint on all files
- `yarn test` - Run all Jest tests
- `yarn test Component.test.tsx` - Run a specific test
- `bundle exec pod install` - Install CocoaPods dependencies (iOS)

## Code Style
- **TypeScript**: Use strict typing; define interfaces for props, state, and function params
- **Formatting**: Uses Prettier with singleQuote, no bracketSpacing, trailing commas
- **Imports**: Group imports: React, then navigation, then native modules, then local components
- **Components**: Functional components with hooks; use React.FC type
- **Naming**: PascalCase for components, camelCase for functions and variables
- **Error Handling**: Use try/catch with detailed error logging; use optional chaining
- **Navigation**: Use typed refs and params with React Navigation
- **File Structure**: One component per file; use .tsx extension

## Project Conventions
- Platform-specific code via Platform.OS checks
- Console logging for debugging with descriptive prefixes
- Event listeners properly removed in useEffect cleanup