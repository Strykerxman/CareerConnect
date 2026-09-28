# CareerConnect
A web-based platform designed to help job seekers manage their job search activities.

# Git & Workflow Guide

To keep our repository organized and avoid breaking code, we follow a specific branch strategy. Please use this guide whenever you are working on features.

## Important Rules

1. **Please do not try pushing directly to `main`.** Your local code must enter the `dev` branch first.
2. **`dev` is our default branch.** Please only push to `dev`. `main` is the **fully functional, holy-grail** codebase.

Now, to push `dev` code to `main`, create a *Pull Request* (PR). Someone else than yourself will review it and decide what to do with it. PRs may become mandatory for `dev` in the future, but for simplicity and learning, only the `main` branch has these rules.

## How I'd start coding

### 1. Grab a Task
Go to the Github Project Board, the "Projects" tab on the top bar. Assign an *Issue* in the **Backlog** column to yourself and drag it to **In Progress**.

### 2. Update Local Dev Code
Before you write anything, make sure you pull the branch to ensure it's up-to-date on your machine.
```bash
git checkout dev
git pull origin dev
```

### 3. Save Your Work (Commit)
After making changes, add and commit your updates:
```bash
git add .
git commit -m "Briefly explain what you changed or built"
```

### 4. Push Your Code
Once you've done that, you can push the changes to the `dev` branch.
```bash
git push origin dev
```

## It's not working

If Git blocks you from pushing, then someone may have pushed right before you.
So run:  
```bash
git pull origin dev
```  
Resolve the conflicting lines in your IDE (I use VSCode), finalize your version and then finish the push with:  
```bash
git add .
git commit -m "Fix merge conflict"
git push origin dev
```

## Running the Server

Navigate to the `server` directory:

```bash

cd server

```

Install the project dependencies:

```bash

npm ci

```

Install Multer for resume file uploads:

```bash

npm install multer

```

Run the development server:

```bash

npm run dev

```