import { Box, Icon, Stack, Text } from "@chakra-ui/react";

/**
 * Shared empty state, so "nothing here yet" reads the same everywhere and
 * always says what to do next rather than just that a list is empty.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Box
      borderWidth="1px"
      borderColor="line"
      borderStyle="dashed"
      borderRadius="lg"
      px={{ base: 5, md: 8 }}
      py={{ base: 8, md: 12 }}
    >
      <Stack gap="3" align="center" textAlign="center">
        <Icon size="lg" color="fg.subtle">
          {icon}
        </Icon>
        <Stack gap="1">
          <Text fontWeight="semibold">{title}</Text>
          <Text fontSize="sm" color="fg.muted" maxW="sm">
            {description}
          </Text>
        </Stack>
        {action}
      </Stack>
    </Box>
  );
}
