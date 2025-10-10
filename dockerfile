# Use the official Bun image as a parent image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /usr/src/app





# Copy the rest of your application's source code
COPY . .


# Install dependencies
RUN bun install

# Expose the port your app runs on (if applicable)
EXPOSE 3000

RUN bun run build

# Run your bot
CMD ["bun", "run", "start"]